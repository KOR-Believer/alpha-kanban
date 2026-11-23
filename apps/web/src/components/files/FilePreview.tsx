import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Download, File, Minus, Plus, Scan } from "lucide-react";
import { Button } from "../ui/button";
import { useTranslation } from "../../i18n";
import { downloadLinkedResource } from "../../browser/MarkdownResources";
import { inspectPreview, PREVIEW_LIMITS, type FilePreviewData } from "./previewModel";
import { SourceReader } from "./SourceReader";
import "./file-preview.css";

const HtmlPreview = lazy(() => import("./HtmlPreview"));
export type PreviewResourceReader = (sourcePath: string, href: string, signal: AbortSignal) => Promise<{ file: File; path: string }>;
export default function FilePreview({ file, path, readResource, range }: { range?: { start: number; end: number }; file: File; path: string; readResource: PreviewResourceReader }) {
  const { t } = useTranslation();
  const [data, setData] = useState<FilePreviewData>(), [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [zoom, setZoom] = useState<number | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const [imageWidth, setImageWidth] = useState(0);
  const changeZoom = (delta: number) => setZoom(value => Math.max(10, Math.min(400, Math.round(value ?? (image.current?.naturalWidth ? image.current.clientWidth / image.current.naturalWidth * 100 : 100)) + delta)));
  useEffect(() => {
    let active = true, objectUrl: string | undefined;
    setData(undefined); setError(""); setUrl(""); setZoom(null); setImageWidth(0);
    void inspectPreview(file).then(result => {
      if (!active) return;
      if (result.kind === "image" || result.kind === "pdf") { objectUrl = URL.createObjectURL(file.slice(0, file.size, result.mime)); setUrl(objectUrl); }
      setData(result);
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "This file could not be displayed."); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);
  const download = <Button size="sm" variant="outline" onClick={() => downloadLinkedResource({ file })}><Download />{t("Download file")}</Button>;
  return <div className="ak-file-preview" data-tour="file-preview">
    <div className="ak-file-preview-tools"><span className="truncate" title={path}>{file.name}</span><span>{t("{{size}} B", { size: Intl.NumberFormat().format(file.size) })}</span><span>{t("Read-only")}</span>{download}</div>
    {error ? <div className="ak-file-preview-message" role="alert">{t(error)}</div> : !data ? <p className="ak-file-preview-message" role="status">{t("Loading file…")}</p>
      : data.kind === "text" || (data.kind === "html" && range) ? <SourceReader range={range} text={data.text!} truncated={data.truncated} />
      : data.kind === "html" ? <Suspense fallback={<p>{t("Loading file…")}</p>}><HtmlPreview text={data.text!} path={path} readResource={readResource} /></Suspense>
      : data.kind === "image" ? <>
        <div className="ak-file-preview-tools"><Button size="iconSm" variant="ghost" aria-label={t("Zoom out")} onClick={() => changeZoom(-25)}><Minus /></Button>
          <span>{zoom === null ? t("Fit to screen") : `${zoom}%`}</span><Button size="iconSm" variant="ghost" aria-label={t("Zoom in")} onClick={() => changeZoom(25)}><Plus /></Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(null)}><Scan />{t("Fit to screen")}</Button></div>
        <div className="ak-image-preview ak-scroll-area" data-fit={zoom === null}><img ref={image} src={url} alt={file.name} style={zoom === null ? undefined : { width: imageWidth * zoom / 100, maxWidth: "none", maxHeight: "none" }} onError={() => setError("This image could not be displayed. Download it to open with another app.")}
          onLoad={event => { const img = event.currentTarget; setImageWidth(img.naturalWidth); if (img.naturalWidth * img.naturalHeight > PREVIEW_LIMITS.imagePixels) setError("This file is too large to preview. Download it to open with another app."); }} /></div>
      </> : data.kind === "pdf" ? navigator.pdfViewerEnabled === false ? <p className="ak-file-preview-message">{t("The browser's PDF viewer is unavailable. Download the file to open it.")}</p>
        : <iframe className="ak-native-pdf" title={file.name} src={url} onError={() => setError("This PDF could not be displayed. Download it to open with another app.")} />
      : <div className="ak-file-preview-message"><File className="size-8" /><p>{t("Preview is not available for this file type.")}</p><p>{file.type || t("Unknown file type")}</p>{download}</div>}
  </div>;
}
