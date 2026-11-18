import { useEffect, useRef, useState } from "react";
import { Code, Eye } from "lucide-react";
import { Button } from "../ui/button";
import { useTranslation } from "../../i18n";
import { SourceReader } from "./SourceReader";
import { prepareHtml } from "./htmlResources";
import type { PreviewResourceReader } from "./FilePreview";

export default function HtmlPreview({ text, path, readResource }: { text: string; path: string; readResource: PreviewResourceReader }) {
  const { t } = useTranslation();
  const [source, setSource] = useState(false), [prepared, setPrepared] = useState<Awaited<ReturnType<typeof prepareHtml>>>();
  const [error, setError] = useState(""), [token] = useState(() => crypto.randomUUID());
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let dispose: (() => void) | undefined;
    setPrepared(undefined); setError("");
    void prepareHtml(text, path, readResource, controller.signal).then(value => {
      if (controller.signal.aborted) value.dispose(); else { dispose = value.dispose; setPrepared(value); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "HTML preview could not be prepared."); });
    return () => { controller.abort(); dispose?.(); };
  }, [text, path, readResource]);
  useEffect(() => {
    if (!prepared) return;
    let sent = false;
    const listener = (event: MessageEvent) => {
      if (sent || event.origin !== "null" || event.source !== frame.current?.contentWindow || event.data?.type !== "ak-preview-ready" || event.data.token !== token) return;
      sent = true; event.source!.postMessage({ type: "ak-preview-html", token, html: prepared.html, resources: prepared.resources }, { targetOrigin: "*" });
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [prepared, token]);
  return <div className="ak-html-preview">
    <div className="ak-file-preview-tools" data-tour="html-preview-tools"><div role="group" aria-label={t("HTML view")}>
      <Button size="sm" variant={source ? "ghost" : "secondary"} aria-pressed={!source} onClick={() => setSource(false)}><Eye />{t("Preview")}</Button>
      <Button size="sm" variant={source ? "secondary" : "ghost"} aria-pressed={source} onClick={() => setSource(true)}><Code />{t("Source")}</Button></div>
      <span>{t("HTML runs in an isolated view. Its external resources may use the network.")}</span>
    </div>
    {prepared?.failures.length ? <div className="ak-explorer-state" role="status">{t("Some local resources could not be loaded. Check the source or download the file.")}<details><summary>{t("Details")}</summary>{prepared.failures.map(value => <p key={value}>{value}</p>)}</details></div> : null}
    {error ? <p role="alert" className="ak-file-preview-message">{t(error)}</p> : null}
    {prepared ? <iframe ref={frame} className="ak-html-frame" hidden={source} title={t("HTML preview")} sandbox="allow-scripts" referrerPolicy="no-referrer" src={`/file-preview.html#${token}`} /> : !source && !error ? <p role="status">{t("Preparing HTML preview…")}</p> : null}
    {source ? <SourceReader text={text} /> : null}
  </div>;
}
