import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "../../i18n";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void;
  title: string; text: string; success: string;
  children?: ReactNode; returnFocus?: HTMLElement | null;
};

export function RequestDialog({ open, onOpenChange, title, text, success, children, returnFocus }: Props) {
  const { t } = useTranslation();
  const request = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const [copyResult, setCopyResult] = useState<{ text: string; status: "success" | "error" } | null>(null);
  const status = copyResult?.text === text ? copyResult.status : null;
  useEffect(() => {
    generation.current++; setCopyResult(null);
    return () => { generation.current++; };
  }, [open, text]);
  async function copy() {
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(text);
      if (current === generation.current) setCopyResult({ text, status: "success" });
    } catch {
      if (current !== generation.current) return;
      request.current?.focus(); request.current?.select();
      setCopyResult({ text, status: "error" });
    }
  }
  return <Dialog open={open} onOpenChange={(value) => { setCopyResult(null); onOpenChange(value); }}>
    <DialogContent onCloseAutoFocus={returnFocus ? (event) => { event.preventDefault(); returnFocus.focus({ preventScroll: true }); } : undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t("Review this request and send it to your external AI tool. This website does not install skills or launch AI.")}</DialogDescription></DialogHeader>
      <DialogBody className="pb-5">
        <Textarea ref={request} value={text} readOnly aria-label={title} className="min-h-48" />
        {children}
      </DialogBody>
      <DialogFooter className="flex-wrap">
        <p role="status" className="mr-auto text-xs text-muted-foreground">{status === "success" ? t(success) : status === "error" ? t("Text selected. Copy it manually.") : ""}</p>
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Close")}</Button>
        <Button onClick={() => void copy()}><Copy aria-hidden="true" />{t("Copy request")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
