import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { TourButton, useScreenTour } from "../onboarding/ScreenTour";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { browserLinkMappings } from "./repository";
import { FolderIdentity, RepositoryFolderPicker, RepositoryPickerDialog, useRepositoryFilters } from "./RepositoryFolderPicker";
import { folderPrefixes, relativeToPrefix, LocalLinkError } from "./linkPaths";
import type { LinkAttempt, LinkContext, LinkedResource, LinkMapping, LinkTarget, LinkProposal, LinkPreview } from "./linkMappings";
import type { RepoScan } from "./gitDiscovery";
import { linkConnectionsQueryKey, listRevisionConnections, updateRevisionConnection, type RevisionConnection } from "./revisionConnections";

export function LocalLinkDialog({ context, attempt, onClose, onOpen, manage = false }: {
  context: LinkContext; attempt: LinkAttempt; onClose: () => void; onOpen: (resource: LinkedResource) => void; manage?: boolean;
}) {
  const { t } = useTranslation();
  const prefixes = folderPrefixes(attempt.location.path);
  const [prefix, setPrefix] = useState("");
  const [target, setTarget] = useState<LinkTarget>();
  const [proposals, setProposals] = useState<LinkProposal[]>([]);
  const [preview, setPreview] = useState<LinkPreview>();
  const filters = useRepositoryFilters();
  const [scan, setScan] = useState<RepoScan>();
  const [scanning, setScanning] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(attempt.error?.message ?? "");
  const [existing, setExisting] = useState(attempt.mapping);
  const tourContainer = useRef<HTMLDivElement>(null);
  const tour = useScreenTour("link", { enabled: !busy, eligible: false, scope: `${context.documentId}:${preview ? "preview" : "choose"}:${target?.label ?? ""}`, container: tourContainer });
  const abort = useRef<AbortController | null>(null);
  const automaticAbort = useRef<AbortController | null>(null);
  const selectionAbort = useRef<AbortController | null>(null);
  const touched = useRef(false);
  const touch = () => { touched.current = true; automaticAbort.current?.abort(); };
  const callbacks = useRef({ onOpen, onClose }); callbacks.current = { onOpen, onClose };
  usePwaDraft(Boolean(target) || busy);
  useEffect(() => () => selectionAbort.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); abort.current = controller;
    const autoController = new AbortController(); automaticAbort.current = autoController;
    setScanning(true); setScan(undefined);
    const preferred = manage && attempt.mapping ? { ...context, label: attempt.mapping.label } : context;
    void browserLinkMappings.scan({ preferred, signal: controller.signal, refresh: refresh > 0, continuous: true, onProgress: (value) => { if (!controller.signal.aborted) setScan(value); } }).then(async (value) => {
      if (controller.signal.aborted) return;
      setScan(value); setScanning(false);
      if (!touched.current && !attempt.mapping) {
        const resource = await browserLinkMappings.automatic(context, attempt, value, autoController.signal);
        if (resource && !autoController.signal.aborted) callbacks.current.onOpen(resource);
      }
    }).catch((failure) => { if (!controller.signal.aborted && !(failure instanceof Error && failure.name === "AbortError")) { setError(browserLinkMappings.error(failure).message); setScanning(false); } });
    return () => { controller.abort(); autoController.abort(); };
  }, [context, attempt, manage, refresh]);

  const run = async (fn: () => Promise<void>) => {
    touch(); setBusy(true); setError("");
    try { await fn(); } catch (failure) { if (!(failure instanceof Error && failure.name === "AbortError")) setError(browserLinkMappings.error(failure).message); }
    finally { setBusy(false); }
  };
  const stopScan = () => {
    touch(); abort.current?.abort();
    if (!scanning) return;
    setScanning(false);
    setScan(value => ({ repos: value?.repos ?? [], visited: value?.visited ?? 0, complete: false, reasons: ["cancelled"] }));
  };
  const choose = async (selected: LinkTarget) => {
    stopScan();
    selectionAbort.current?.abort(); const controller = new AbortController(); selectionAbort.current = controller;
    setTarget(selected); setPreview(undefined); setPrefix(""); setProposals([]);
    const found = await browserLinkMappings.propose(attempt.location, selected, controller.signal);
    if (controller.signal.aborted) return;
    setProposals(found);
    // Several existing suffix paths require a choice, even if one looks like a repo path.
    if (found.length === 1) setPrefix(found[0]!.prefix);
    if (!found.length) { setPrefix(existing?.prefix ?? prefixes[0] ?? ""); setError("The file is missing at this location. Check the remaining path or choose another folder."); }
  };
  const chooseFolder = () => run(async () => {
    const handle = await window.showDirectoryPicker({ id: "alpha-kanban-link", mode: "read" });
    const repo = scan?.repos.find((item) => item.handle === handle);
    // Resolve physical identity only from granted handles, never from the folder name.
    let known = repo;
    for (const candidate of scan?.repos ?? []) if (await candidate.handle.isSameEntry(handle)) { known = candidate; break; }
    await choose({ handle, label: known?.label ?? handle.name, repo: known });
  });
  const remaining = prefix ? relativeToPrefix(attempt.location.path, prefix) : undefined;
  const review = () => run(async () => setPreview(await browserLinkMappings.preview(context, attempt.location, prefix, target!, existing?.prefix === prefix ? existing : undefined)));
  return <RepositoryPickerDialog contentRef={tourContainer} onClose={onClose} lockDismiss={busy || tour.active}
    title={t(preview ? "Review link connection" : existing ? "Change link connection" : "Connect local link")}
    description={t("Choose a local repository or folder, then check which old path it replaces.")}
    headerAction={<TourButton tour={tour} labelKey="Tour this dialog" />}
    footer={<>{preview ? <Button variant="ghost" disabled={busy} className="mr-auto" onClick={() => { setPreview(undefined); setError(""); }}><ArrowLeft />{t("Back")}</Button> : null}<Button variant="outline" disabled={busy} onClick={onClose}>{t("Cancel")}</Button><Button data-tour="link-apply" disabled={!target || !remaining || busy} onClick={() => void (preview ? run(async () => {
      const resource = await browserLinkMappings.save(context, attempt.location, prefix, target!, preview.expected, undefined, undefined, preview);
      onOpen(resource);
    }) : review())}>{t(preview ? manage ? "Save link connection" : existing?.prefix === prefix ? "Replace connection and open" : "Connect and open" : "Review selected folder")}</Button></>}>
      <details className="min-w-0"><summary data-tour="link-original" className="cursor-pointer font-medium">{t("Original link path")}</summary><code className="mt-2 block break-all text-xs text-muted-foreground">{attempt.location.path}</code></details>
      {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
      {preview ? <>
        <section data-tour="link-preview" className="grid gap-3 rounded-lg border border-border p-4">
          <h3 className="font-semibold">{t("Connection to save")}</h3><FolderIdentity target={target!} />
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("Old folder to replace")}</span><code className="break-all">{prefix}</code></div>
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("File to open inside the selected folder")}</span><code className="break-all">{remaining}</code></div>
        </section>
        {preview.overlap ? <section className="grid gap-3 rounded-lg border border-border p-4" aria-label={t("File that will open")}>
          <h3 className="font-semibold">{t("File that will open")}</h3><p className="text-muted-foreground">{t("A more specific saved connection applies to this file. It will stay in use.")}</p>
          <p className="break-all font-medium">{preview.target.label}</p><code className="break-all">{preview.relative}</code>
          <Button size="sm" variant="outline" className="justify-self-start" disabled={busy} onClick={() => { setExisting(preview.overlap); setTarget(undefined); setPreview(undefined); setPrefix(""); }}>{t("Review the saved connection instead")}</Button>
        </section> : null}
        <p className="text-muted-foreground">{t("Reuse for matching links from {{project}}.", { project: (context.origin ?? context).label })}</p>
        <p className="text-xs text-muted-foreground">{t("This connection is reused for links with the same old folder in this project. It is saved only in this browser and site address.")}</p>
      </> : <>
        {existing ? <div className="grid gap-2 text-sm"><p className="break-all">{t("Saved folder: {{folder}}", { folder: existing.label })}</p><code className="break-all text-xs">{existing.prefix}</code>
          <Button variant="outline" size="sm" className="justify-self-start" disabled={busy} onClick={() => void run(async () => {
            if (await existing.handle.requestPermission({ mode: "read" }) !== "granted") throw new LocalLinkError("permission", "Allow access to the saved link folder, or choose another folder.");
            onOpen(await browserLinkMappings.retry(existing, attempt.location));
          })}>{t(manage ? "Check folder access" : "Allow access and retry")}</Button>
        </div> : null}
        <RepositoryFolderPicker scan={scan} filters={filters} scanning={scanning} busy={busy} discover={browserLinkMappings.autoDiscover}
          selectedId={target?.repo?.id} touch={touch} onRefresh={() => setRefresh(value => value + 1)}
          onStop={stopScan}
          onPick={() => void chooseFolder()} onSelect={repo => void run(() => choose({ handle: repo.handle, label: repo.label, repo }))} />
        {target ? <section data-tour="link-selection" className="grid min-w-0 gap-3 border-t border-border pt-4">
          <p className="break-all font-medium">{t("Selected folder: {{folder}}", { folder: target.label })}</p>
          {proposals.length > 1 ? <p>{t("Several paths exist in this folder. Choose the intended file.")}</p> : null}
          <label className="grid min-w-0 gap-2 font-medium">{t("Old folder to replace")}<Select value={prefix} onValueChange={setPrefix} disabled={busy}><SelectTrigger size="field" className="w-full min-w-0"><SelectValue placeholder={t("Choose a matching path")} /></SelectTrigger><SelectContent>{(proposals.length ? proposals.map((item) => item.prefix) : prefixes).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("File to open inside the selected folder")}</span><code className="break-all">{remaining ?? "—"}</code></div>
        </section> : null}
      </>}
  </RepositoryPickerDialog>;
}

export function LinkConnectionManager() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const paths = useQuery({ queryKey: [...linkConnectionsQueryKey, "paths"], queryFn: () => browserLinkMappings.list(), refetchOnWindowFocus: true });
  const revisions = useQuery({ queryKey: [...linkConnectionsQueryKey, "revisions"], queryFn: listRevisionConnections, refetchOnWindowFocus: true });
  const [editing, setEditing] = useState<{ context: LinkContext; attempt: LinkAttempt }>();
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<LinkMapping | RevisionConnection>();
  const [busy, setBusy] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: linkConnectionsQueryKey });
  async function remove() {
    if (!removing) return;
    setBusy(true); setError("");
    try {
      if ("key" in removing) await updateRevisionConnection(removing.key, removing.handle);
      else await browserLinkMappings.remove(removing);
    } catch (failure) { setError(browserLinkMappings.error(failure).message); }
    finally { setRemoving(undefined); await refresh(); setBusy(false); }
  }
  return <section data-tour="link-connections" className="grid gap-2">
    <h3 className="text-sm font-semibold">{t("Link connections")}</h3>
    {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
    {(paths.isError || revisions.isError) && <p role="alert" className="text-sm text-destructive">{t("Saved link connections could not be read. Try again before changing a connection.")}</p>}
    {paths.isSuccess && revisions.isSuccess && !paths.isFetching && !revisions.isFetching && !paths.data.length && !revisions.data.length && <p className="text-sm text-muted-foreground">{t("No saved link connections.")}</p>}
    {paths.data?.map((mapping) => <div key={mapping.id} className="grid gap-2 border-b border-border py-2 text-sm">
      <p className="break-all">{mapping.sourceLabel}: {mapping.prefix} → {mapping.label}</p>
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing({ context: { scopeId: mapping.scopeId, label: mapping.sourceLabel, root: mapping.handle, path: "", documentId: "" }, attempt: { location: { path: mapping.example, fragment: "", absolute: !mapping.example.startsWith("./") }, mapping } })}>{t("Change link connection")}</Button><Button size="sm" variant="ghost" onClick={() => setRemoving(mapping)}>{t("Remove link connection")}</Button></div>
    </div>)}
    {revisions.data?.map(connection => <div key={connection.key} className="grid min-w-0 gap-2 border-b border-border py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="muted">{t("Git revision link")}</Badge>
        <span className="break-all text-muted-foreground">{connection.projectName ?? t(connection.scope === "/all" ? "All tickets" : "Outside a project")}</span></div>
      <p className="break-all"><code>{connection.repository}</code> → {connection.folder}</p>
      <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setRemoving(connection)}>{t("Remove link connection")}</Button>
    </div>)}
    {editing ? <LocalLinkDialog {...editing} manage onClose={() => { setEditing(undefined); void refresh(); }} onOpen={() => { setEditing(undefined); void refresh(); }} /> : null}
    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(undefined); }}><DialogContent>
      <DialogHeader><DialogTitle>{t("Remove link connection")}</DialogTitle><DialogDescription>{t("Remove this saved connection? Files and Markdown links will stay unchanged.")}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRemoving(undefined)}>{t("Cancel")}</Button><Button disabled={busy} onClick={() => void remove()}>{t("Remove link connection")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
