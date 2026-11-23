import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { CodeDiff } from "../components/CodeDiff";
import { SourceReader } from "../components/files/SourceReader";
import { Button } from "../components/ui/button";
import { useTranslation } from "../i18n";
import { downloadLinkedResource } from "./MarkdownResources";
import type { RepoCandidate } from "./gitDiscovery";
import { LocalLinkError } from "./linkPaths";
import { revisionContents } from "./revisionRepository";
import { inspectComparisonFile, limitImagePair, type ComparisonSide } from "./revisionComparisonModel";

export default function RevisionComparison({ repo, target, file, fileError, onReconnect }: {
  repo: RepoCandidate; target: RevisionTarget; file?: File; fileError?: string; onReconnect: () => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ before: ComparisonSide; after: ComparisonSide; reconnect: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setResult(undefined);
    let reconnect = false;
    const historical: Promise<ComparisonSide> = file ? inspectComparisonFile(file) : Promise.resolve({ kind: "notice", message: fileError ?? "The Git objects could not be read." });
    const working = revisionContents(repo, target, true, signal).then(inspectComparisonFile).catch((failure): ComparisonSide => {
      const code = failure instanceof LocalLinkError ? failure.code : undefined;
      reconnect = code === "permission" || code === "folder";
      const message = code === "missing" ? "The current file is missing at the cited path." : reconnect
        ? "Allow read access to the Git repository." : "The current file could not be read.";
      return { kind: "notice", message };
    });
    void Promise.all([historical, working]).then(([before, after]) => {
      if (!signal.aborted) setResult({ before, after: limitImagePair(before, after), reconnect });
    });
    return () => controller.abort();
  }, [repo, target.commit, target.path, file, fileError]);
  const beforeLabel = t("Cited revision") + " · " + target.commit.slice(0, 8);
  const afterLabel = t("Current working file");
  if (!result) return <p className="p-5 text-sm text-muted-foreground" role="status">{t("Reading files to compare…")}</p>;
  const { before, after } = result;
  const width = Math.max(before.kind === "image" ? before.width : 0, after.kind === "image" ? after.width : 0, 1);
  return <div className="ak-revision-comparison ak-scroll-area" data-revision-comparison>
    {before.kind === "text" && after.kind === "text" ? <>
      {before.text === after.text && <p className="mb-3 text-sm" role="status">{t("The two files have identical text.")}</p>}
      <CodeDiff before={before.text} after={after.text} beforeLabel={beforeLabel} afterLabel={afterLabel} />
    </> : <div className="ak-revision-pair">
      <Side label={beforeLabel} side={before} sharedWidth={width} />
      <Side label={afterLabel} side={after} sharedWidth={width} onReconnect={result.reconnect ? onReconnect : undefined} />
    </div>}
  </div>;
}

function Side({ label, side, sharedWidth, onReconnect }: { label: string; side: ComparisonSide; sharedWidth: number; onReconnect?: () => void }) {
  const { t } = useTranslation();
  const file = side.file;
  return <section className="ak-revision-side" aria-label={label}>
    <header><strong>{label}</strong>
      {file && <span>{t("{{size}} B", { size: file.size.toLocaleString() })}</span>}
      {side.kind !== "text" && side.width && side.height ? <span>{side.width} × {side.height}</span> : null}
    </header>
    {side.kind === "image" ? <ComparisonImage side={side} label={label} sharedWidth={sharedWidth} />
      : side.kind === "text" ? <SourceReader text={side.text} /> : <div className="ak-revision-side-message">
        <p role="status">{t(side.message)}</p>
        {onReconnect && <Button size="sm" variant="outline" onClick={onReconnect}>{t("Choose repository folder")}</Button>}
        {file && <Button size="sm" variant="ghost" onClick={() => downloadLinkedResource({ file })}><Download />{t("Download file")}</Button>}
      </div>}
  </section>;
}

function ComparisonImage({ side, label, sharedWidth }: { side: Extract<ComparisonSide, { kind: "image" }>; label: string; sharedWidth: number }) {
  const { t } = useTranslation();
  const [source, setSource] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => {
    const url = URL.createObjectURL(side.file.slice(0, side.file.size, side.mime));
    setSource(url); setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [side.file, side.mime]);
  return <div className="ak-revision-image">{failed ? <p role="status">{t("This image could not be displayed.")}</p> : source &&
    <img src={source} alt={label + " · " + side.file.name} style={{ width: 100 * side.width / sharedWidth + "%" }} onError={() => setFailed(true)} />}</div>;
}
