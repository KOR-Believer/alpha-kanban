import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarkdownDocumentResponse, MarkdownFileSummary } from "@alpha-kanban/shared";
import { parseSmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";
import { browserRepository } from "../../browser/repository";
import { BrowserReconnect } from "../../browser/BrowserConnections";
import { useTranslation } from "../../i18n";
import { Button } from "../ui/button";
import { SmokeSheetReader } from "./SmokeSheetReader";
import { smokeSheetTabs, snapshotPath } from "./smokeSheets";
import { NewSmokeRun } from "./NewSmokeRun";
import { SmokeEditor } from "./SmokeEditor";
import { SmokeComparison } from "./SmokeComparison";

export function ProjectSmokeSheets({ file, document, fileHref, onFileSelect, isAvailable = true }: {
  file: MarkdownFileSummary; document: MarkdownDocumentResponse;
  fileHref: (file: MarkdownFileSummary) => string; onFileSelect: (file: MarkdownFileSummary) => void;
  isAvailable?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const model = useMemo(() => parseSmokeDocument(document.markdown, file.type === "smoke" ? "smoke" : "smoke-run"), [document.markdown, file.type]);
  const collection = useQuery({ queryKey: ["smoke-family", file.workspaceId], queryFn: () => browserRepository.smokeCollection(file.workspaceId), staleTime: 30_000, enabled: isAvailable });
  const context = useQuery({ queryKey: ["smoke-context", file.workspaceId, file.id, file.relativePath], queryFn: () => browserRepository.linkContext(file.workspaceId, file.id), enabled: isAvailable });
  const checked = useRef("");
  useEffect(() => {
    const stamp = `${file.id}:${document.file.hash}`;
    if (!collection.data || checked.current === stamp) return;
    checked.current = stamp;
    if (collection.data.files.find(item => item.id === file.id)?.hash !== document.file.hash) void client.invalidateQueries({ queryKey: ["smoke-family", file.workspaceId] });
  }, [client, document.file.hash, file.id, file.workspaceId, collection.data]);
  const tabs = useMemo(() => collection.data ? smokeSheetTabs(file.id, collection.data.index, collection.data.entries) : undefined, [file.id, collection.data]);
  const definitionContext = useMemo(() => {
    const path = snapshotPath(model);
    return path && context.data ? { ...context.data, path } : undefined;
  }, [model, context.data]);
  const relation = collection.data?.index.runs.find(run => run.localId === file.id);
  const duplicate = collection.data?.index.duplicates.some(duplicate => duplicate.localIds.includes(file.id));
  const notice = !isAvailable ? <div className="ak-smoke-notice" role="status"><p>{t("Folder access is unavailable. Reconnect the folder before making changes. Your open form is kept.")}</p><BrowserReconnect workspaceId={file.workspaceId} /></div>
    : collection.isError ? <p className="ak-smoke-notice" role="status">{t("Other sheets could not be loaded. You can still read this document.")} <Button size="xs" variant="ghost" onClick={() => void collection.refetch()}>{t("Retry")}</Button></p>
    : duplicate || relation && relation.status !== "linked" ? <p className="ak-smoke-notice" role="status">{t(duplicate || relation?.status === "ambiguous" ? "Duplicate document IDs prevent linking sheets. Each file remains readable." : "The source definition could not be linked in this project. This run keeps its own criteria and records.")}</p> : null;
  const editable = isAvailable && model.valid && model.format.writable && !duplicate;
  return <SmokeEditor key={file.id} file={file} document={document}>{actions => <SmokeSheetReader document={model} file={file} snapshotContext={definitionContext} tabs={tabs} notice={notice}
    onEditCase={editable ? actions.editCase : undefined} onEditMemo={editable ? actions.editMemo : undefined} onCloseRun={editable ? actions.closeRun : undefined}
    runAction={<><NewSmokeRun key={file.id} disabled={!isAvailable} workspaceId={file.workspaceId} sourceFileId={model.kind === "smoke" ? file.id : relation?.status === "linked" ? relation.sourceLocalId ?? undefined : undefined} onCreated={onFileSelect} /><SmokeComparison key={`compare:${file.id}`} workspaceId={file.workspaceId} fileId={file.id} /></>}
    fileHref={id => fileHref(collection.data?.files.find(item => item.id === id) ?? file)}
    onFileSelect={id => { const target = collection.data?.files.find(item => item.id === id) ?? (id === file.id ? file : undefined); if (target) onFileSelect(target); }} />}</SmokeEditor>;
}
