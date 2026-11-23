import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { revisionWebUrl, type RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { Button, buttonVariants } from "../components/ui/button";
import { useTranslation } from "../i18n";
import type { RepoScan } from "./gitDiscovery";
import { LocalLinkError } from "./linkPaths";
import { RepositoryFolderPicker, RepositoryPickerDialog, useRepositoryFilters } from "./RepositoryFolderPicker";
import { browserLinkMappings, browserRepository } from "./repository";
import { choiceKey, linkConnectionsQueryKey, updateRevisionConnection } from "./revisionConnections";
import { readRevisionDocument, repositoryPermission, revisionSelection, verifiedRevisionRepo, type RevisionReadResult } from "./revisionRepository";
import { isCitedFileLimit } from "./gitRevisionObject";

const errorMessage = (e: unknown) => e instanceof Error ? e.message : "The Git objects could not be read.";

export function RevisionRepositoryRequest({ target, current, web, scope, choose = false, onFinish, onCancel }: {
  target: RevisionTarget; current: boolean; web: boolean; scope: string; choose?: boolean;
  onFinish: (result: RevisionReadResult) => void; onCancel: () => void;
}) {
  const { t } = useTranslation(), client = useQueryClient();
  const filters = useRepositoryFilters();
  const [visible, setVisible] = useState(choose), [scanning, setScanning] = useState(false), [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<RepoScan>(), [error, setError] = useState("");
  const [permission, setPermission] = useState<FileSystemDirectoryHandle>();
  const operation = useRef<AbortController | null>(null);
  const expected = useRef<FileSystemDirectoryHandle>(undefined);
  const hasExpected = useRef(false);
  const originFocus = useRef(document.activeElement);
  const finished = useRef(false);
  const cancelled = useRef(false);
  const interacted = useRef(choose);
  const finish = useRef(onFinish); finish.current = onFinish;
  const key = choiceKey(scope, target);
  const online = web && revisionWebUrl(target);

  function start() {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    return controller.signal;
  }

  async function read(handle: FileSystemDirectoryHandle, signal: AbortSignal, manual: boolean) {
    setScanning(false); setBusy(true); setError(""); setPermission(undefined);
    let repo;
    try { repo = await verifiedRevisionRepo(handle, target, signal); }
    catch (e) {
      if (signal.aborted) return;
      if (errorMessage(e) === repositoryPermission) setPermission(handle);
      setError(errorMessage(e)); setVisible(true); setBusy(false); return;
    }
    let result: RevisionReadResult;
    try { result = { document: await readRevisionDocument(repo, target, current, signal) }; }
    catch (e) {
      if (signal.aborted) return;
      if (!current && isCitedFileLimit(errorMessage(e))) result = { limitedFile: {repo, message: errorMessage(e)} };
      else {
        if (manual) { setError(errorMessage(e)); setBusy(false); return; }
        result = { message: errorMessage(e) };
      }
    }
    if (signal.aborted) return;
    if ((result.document || result.limitedFile) && (manual || !expected.current)) {
      try {
        await updateRevisionConnection(key, expected.current, handle, signal);
        if (!signal.aborted) void client.invalidateQueries({ queryKey: linkConnectionsQueryKey });
      } catch (e) {
        if (signal.aborted) return;
        result.message = e instanceof LocalLinkError ? e.message : "This repository could not be remembered in this browser.";
      }
    }
    if (signal.aborted) return;
    finished.current = true;
    finish.current(result);
  }

  async function discover(chooseFolder: boolean, refresh = false) {
    const signal = start();
    setScanning(true); setScan(undefined); setBusy(false); setPermission(undefined); setError("");
    try {
      const selection = await revisionSelection(scope, target, signal, { choose: chooseFolder, refresh,
        onProgress: next => { if (!signal.aborted) setScan(next); } });
      if (signal.aborted) return;
      expected.current = selection.saved; hasExpected.current = true;
      setScan(selection.scan); setScanning(false);
      if (selection.handle && !(interacted.current && selection.scan)) await read(selection.handle, signal, false);
      else setVisible(true);
    } catch (e) {
      if (!signal.aborted) { setError(errorMessage(e)); setVisible(true); setScanning(false); setBusy(false); }
    }
  }

  async function select(getHandle: () => Promise<FileSystemDirectoryHandle | undefined>) {
    const signal = start();
    setScanning(false); setBusy(true); setError("");
    try {
      // Invoke the native picker/permission request inside the actual click.
      const handle = await getHandle();
      if (signal.aborted) return;
      if (!handle) { setError(repositoryPermission); setBusy(false); return; }
      if (!hasExpected.current) {
        expected.current = await browserRepository.storage.get<FileSystemDirectoryHandle>(key);
        hasExpected.current = true;
      }
      if (!signal.aborted) await read(handle, signal, true);
    } catch (e) {
      if (!signal.aborted) { if (!(e instanceof Error && e.name === "AbortError")) setError(errorMessage(e)); setBusy(false); }
    }
  }

  useEffect(() => {
    if (choose) setVisible(true);
    void discover(choose);
    // Fast, already connected links go straight to the document. Longer lookups
    // stay cancellable over the source without adding an entry to its history.
    const timer = window.setTimeout(() => { if (!finished.current) setVisible(true); }, 450);
    return () => { window.clearTimeout(timer); operation.current?.abort(); };
  }, [key, target.commit, target.path, current, choose]);

  function cancel() { cancelled.current = true; operation.current?.abort(); onCancel(); }
  if (!visible) return null;
  return <RepositoryPickerDialog onClose={cancel} title={t("Choose repository folder")}
    description={t("Choose the local repository that contains this commit. Future links from this project will use the same folder.")}
    onCloseAutoFocus={event => {
      event.preventDefault();
      if (cancelled.current && originFocus.current instanceof HTMLElement && originFocus.current.isConnected) originFocus.current.focus({ preventScroll: true });
    }}
    footer={<>{online && <a className={buttonVariants({ size: "sm", variant: "ghost", className: "mr-auto" })} href={online} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      <ExternalLink />{t("Web original")}</a>}<Button variant="outline" onClick={cancel}>{t("Cancel")}</Button></>}>
        <div className="grid gap-1">
          {target.repo && <p className="break-all font-medium">{target.repo}</p>}
          <p className="break-all text-xs text-muted-foreground"><code title={target.commit}>{target.commit.slice(0, 8)}</code> · {target.path}</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
        {permission && <Button size="sm" variant="outline" className="justify-self-start" disabled={busy} onClick={() => void select(async () =>
          await permission.requestPermission({ mode: "read" }) === "granted" ? permission : undefined)}>{t("Allow read access")}</Button>}
        {busy && <p role="status" className="text-sm text-muted-foreground">{t("Reading Git revision…")}</p>}
        <RepositoryFolderPicker scan={scan} filters={filters} scanning={scanning} busy={busy} discover={browserLinkMappings.autoDiscover} repositoryHint={target.repo} touch={() => { interacted.current = true; }}
          onRefresh={() => void discover(true, true)} onStop={() => {
            operation.current?.abort(); setScanning(false);
            setScan(previous => ({ complete: false, reasons: ["cancelled"], visited: previous?.visited ?? 0, repos: previous?.repos ?? [] }));
          }}
          onPick={() => void select(() => window.showDirectoryPicker({ id: "alpha-kanban-link", mode: "read" }))}
          onSelect={repo => void select(async () => repo.handle)} candidateLabel={repo => t("Use {{folder}}", { folder: repo.label })} />
  </RepositoryPickerDialog>;
}
