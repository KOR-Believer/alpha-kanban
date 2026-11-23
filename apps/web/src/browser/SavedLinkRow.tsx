import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import type { LinkMapping } from "./linkMappings";

export function SavedLinkRow({ mapping, onChange, onRemove }: {
  mapping: Pick<LinkMapping, "sourceLabel" | "prefix" | "label">; onChange: () => void; onRemove: () => void;
}) {
  const { t } = useTranslation();
  return <div className="grid gap-2 border-b border-border py-2 text-sm">
    <p className="break-all">{mapping.sourceLabel}: {mapping.prefix} → {mapping.label}</p>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={onChange}>{t("Change link connection")}</Button>
      <Button size="sm" variant="ghost" onClick={onRemove}>{t("Remove link connection")}</Button>
    </div>
  </div>;
}
export function RemoveLinkDialog({ open, busy, onClose, onRemove }: {
  open: boolean; busy: boolean; onClose: () => void; onRemove: () => void;
}) {
  const { t } = useTranslation();
  return <Dialog open={open} onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent>
      <DialogHeader><DialogTitle>{t("Remove link connection")}</DialogTitle><DialogDescription>{t("Remove this saved connection? Files and Markdown links will stay unchanged.")}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onClose()}>{t("Cancel")}</Button><Button disabled={busy} onClick={onRemove}>{t("Remove link connection")}</Button></DialogFooter>
    </DialogContent></Dialog>;
}
