import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "../../i18n";
import { Button } from "../ui/button";
import { PREVIEW_LIMITS } from "./previewModel";

// Deliberately bounded lexical color, never raw HTML or executable source.
function lineTokens(line: string) {
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|#.*$|--.*$|\b(?:const|let|var|function|return|if|else|import|export|from|class|new|async|await|true|false|null|undefined|SELECT|FROM|WHERE|INSERT|UPDATE|CREATE|TABLE|def|for|while|in|public|private|type|interface)\b|\b\d+(?:\.\d+)?\b)/g;
  return line.split(pattern).map((part, index) => index % 2 ? <span key={index} className={/^(?:\/\/|#|--)/.test(part) ? "ak-source-comment" : /^["'`]/.test(part) ? "ak-source-string" : /^\d/.test(part) ? "ak-source-number" : "ak-source-keyword"}>{part}</span> : part);
}
export function SourceReader({ text, truncated = false }: { text: string; truncated?: boolean }) {
  const { t } = useTranslation(), viewport = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => {
    const source = text.slice(0, PREVIEW_LIMITS.textBytes).split(/\r?\n/);
    return { lines: source.slice(0, PREVIEW_LIMITS.lines).map(line => line.slice(0, PREVIEW_LIMITS.lineLength)),
      clipped: text.length > PREVIEW_LIMITS.textBytes || source.length > PREVIEW_LIMITS.lines || source.some(line => line.length > PREVIEW_LIMITS.lineLength) };
  }, [text]);
  const lines = visible.lines;
  truncated ||= visible.clipped;
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const virtual = useVirtualizer({ count: lines.length, getScrollElement: () => viewport.current, estimateSize: () => 22, overscan: 15 });
  return <div className="ak-source-reader">
    <div className="ak-file-preview-tools"><span>{t("{{count}} lines", { count: lines.length })}</span>{truncated ? <span role="status">{t("Showing part of this file. Download for the complete contents.")}</span> : null}
      <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(lines.join("\n")).then(() => setCopy("done")).catch(() => setCopy("failed")); }}>{copy === "done" ? <Check /> : <Copy />}{t(truncated ? "Copy visible text" : "Copy")}</Button>
      {copy === "failed" ? <span role="status">{t("Copy failed. Select the text or download the file.")}</span> : null}</div>
    <div className="ak-source-scroll ak-scroll-area" ref={viewport} tabIndex={0} aria-label={t("File source")}>
      <pre style={{ height: virtual.getTotalSize(), position: "relative", minWidth: Math.min(4000, Math.max(80, ...lines.map(line => line.length))) + "ch" }}>
        {virtual.getVirtualItems().map(row => <div key={row.key} className="ak-source-line" style={{ position: "absolute", top: row.start, height: row.size }}><span className="ak-source-line-number" aria-hidden="true">{row.index + 1}</span><code>{lineTokens(lines[row.index]!) || " "}</code></div>)}
      </pre>
    </div>
  </div>;
}
