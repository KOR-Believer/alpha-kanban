import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { browserLinkMappings } from "./repository";
import { folderPrefixes, relativeToPrefix, LocalLinkError } from "./linkPaths";
import type { LinkAttempt, LinkContext, LinkedResource, LinkMapping, LinkTarget, LinkProposal, LinkPreview } from "./linkMappings";
import type { RepoCandidate, RepoScan } from "./gitDiscovery";

function FolderIdentity({ target }: { target: LinkTarget }) {
  const { t } = useTranslation();
  return <span className="grid min-w-0 gap-1 text-sm">
    <span className="flex flex-wrap items-center gap-2 font-medium"><FolderOpen className="size-4 shrink-0" />{target.handle.name}
      {target.repo?.kind === "worktree" ? <Badge variant="muted">{t("Worktree")}</Badge> : null}</span>
    <span className="break-all text-xs font-normal text-muted-foreground">{target.repo ? target.label : t("Directly selected folder")}</span>
    {target.repo ? <span className="break-all text-xs font-normal text-muted-foreground">{target.repo.remotes.length ? target.repo.remotes.join(" · ") : t("Repository identity unavailable; check the folder location.")}</span> : null}
  </span>;
}

export function LocalLinkDialog({ context, attempt, onClose, onOpen, manage = false }: {
  context: LinkContext; attempt: LinkAttempt; onClose: () => void; onOpen: (resource: LinkedResource) => void; manage?: boolean;
}) {
  const { t } = useTranslation();
  const prefixes = folderPrefixes(attempt.location.path);
  const [prefix, setPrefix] = useState("");
  const [target, setTarget] = useState<LinkTarget>();
  const [proposals, setProposals] = useState<LinkProposal[]>([]);
  const [preview, setPreview] = useState<LinkPreview>();
  const [search, setSearch] = useState("");
  const [rootFilter, setRootFilter] = useState("all");
  const [scan, setScan] = useState<RepoScan>();
  const [scanning, setScanning] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(attempt.error?.message ?? "");
  const [existing, setExisting] = useState(attempt.mapping);
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
    setScanning(true);
    const preferred = manage && attempt.mapping ? { ...context, label: attempt.mapping.label } : context;
    void browserLinkMappings.scan({ preferred, signal: controller.signal, refresh: refresh > 0, onProgress: (value) => { if (!controller.signal.aborted) setScan(value); } }).then(async (value) => {
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
  const choose = async (selected: LinkTarget) => {
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
  const roots = [...new Map(scan?.repos.map((repo) => [repo.rootId, repo.rootName ?? repo.label.split("/")[0]!])).entries()];
  const matches = scan?.repos.filter((repo) => (rootFilter === "all" || repo.rootId === rootFilter) && (repo.label + " " + repo.remotes.join(" ")).toLowerCase().includes(search.toLowerCase())) ?? [];
  const remaining = prefix ? relativeToPrefix(attempt.location.path, prefix) : undefined;
  const review = () => run(async () => setPreview(await browserLinkMappings.preview(context, attempt.location, prefix, target!, existing?.prefix === prefix ? existing : undefined)));
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="w-[min(680px,calc(100vw-2rem))]" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
    <DialogHeader className="pr-12"><DialogTitle>{t(preview ? "Review link connection" : existing ? "Change link connection" : "Connect local link")}</DialogTitle><DialogDescription>{t("Choose a local repository or folder, then check which old path it replaces.")}</DialogDescription></DialogHeader>
    <DialogBody><div className="grid min-w-0 gap-4 text-sm">
      <details className="min-w-0"><summary className="cursor-pointer font-medium">{t("Original link path")}</summary><code className="mt-2 block break-all text-xs text-muted-foreground">{attempt.location.path}</code></details>
      {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
      {preview ? <>
        <section className="grid gap-3 rounded-lg border border-border p-4">
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
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t("Folder on this computer")}</h3><Button variant="outline" size="sm" disabled={busy} onClick={() => void chooseFolder()}><FolderOpen />{t("Choose folder directly")}</Button></div>
        {browserLinkMappings.autoDiscover ? <>
          <div className="flex min-w-0 flex-wrap gap-2"><Input className="min-w-0 flex-1" aria-label={t("Search discovered repositories")} placeholder={t("Search discovered repositories")} value={search} onChange={(event) => { touch(); setSearch(event.target.value); }} />
            {roots.length > 1 ? <Select value={rootFilter} onValueChange={setRootFilter}><SelectTrigger size="field" className="max-w-full" aria-label={t("Connected root")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("All connected roots")}</SelectItem>{roots.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select> : null}
            <Button variant="outline" size="icon" aria-label={t("Refresh repositories")} disabled={busy || scanning} onClick={() => { touch(); setRefresh((value) => value + 1); }}><RefreshCw /></Button></div>
          {scanning ? <div className="flex items-center justify-between gap-2"><p role="status" className="text-xs text-muted-foreground">{t("Looking for repositories in connected folders…")}</p><Button size="xs" variant="ghost" onClick={() => { touch(); abort.current?.abort(); setScanning(false); setScan((value) => ({ repos: value?.repos ?? [], visited: value?.visited ?? 0, complete: false, reasons: ["cancelled"] })); }}>{t("Stop search")}</Button></div> : null}
          {!scanning && scan && !scan.complete ? <p className="text-xs text-muted-foreground">{t(scan.reasons.some((reason) => ["limit", "depth"].includes(reason)) ? "Search reached its limit. Choose a result, select a folder directly, or search again." : "Some folders could not be searched. You can choose a folder directly or search again.")}</p> : null}
          <div className="grid gap-1">{matches.slice(0, 30).map((repo) => <Button key={repo.id} variant={target?.repo?.id === repo.id ? "secondary" : "ghost"} className="h-auto justify-start whitespace-normal py-3 text-left" aria-pressed={target?.repo?.id === repo.id} disabled={busy} onClick={() => void run(() => choose({ handle: repo.handle, label: repo.label, repo }))}><span className="min-w-0 flex-1"><FolderIdentity target={{ handle: repo.handle, label: repo.label, repo }} /></span>{target?.repo?.id === repo.id ? <Check className="shrink-0" /> : null}</Button>)}</div>
          {matches.length > 30 ? <p className="text-xs text-muted-foreground">{t("Narrow the search to see more repositories.")}</p> : !scanning && !matches.length ? <p className="text-sm text-muted-foreground">{t("No matching repositories. Choose a folder directly.")}</p> : null}
        </> : null}
        {target ? <section className="grid min-w-0 gap-3 border-t border-border pt-4">
          <p className="break-all font-medium">{t("Selected folder: {{folder}}", { folder: target.label })}</p>
          {proposals.length > 1 ? <p>{t("Several paths exist in this folder. Choose the intended file.")}</p> : null}
          <label className="grid min-w-0 gap-2 font-medium">{t("Old folder to replace")}<Select value={prefix} onValueChange={setPrefix} disabled={busy}><SelectTrigger size="field" className="w-full min-w-0"><SelectValue placeholder={t("Choose a matching path")} /></SelectTrigger><SelectContent>{(proposals.length ? proposals.map((item) => item.prefix) : prefixes).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("File to open inside the selected folder")}</span><code className="break-all">{remaining ?? "—"}</code></div>
        </section> : null}
      </>}
    </div></DialogBody>
    <DialogFooter className="flex-wrap">{preview ? <Button variant="ghost" disabled={busy} className="mr-auto" onClick={() => { setPreview(undefined); setError(""); }}><ArrowLeft />{t("Back")}</Button> : null}<Button variant="outline" disabled={busy} onClick={onClose}>{t("Cancel")}</Button><Button disabled={!target || !remaining || busy} onClick={() => void (preview ? run(async () => {
      const resource = await browserLinkMappings.save(context, attempt.location, prefix, target!, preview.expected, undefined, undefined, preview);
      onOpen(resource);
    }) : review())}>{t(preview ? manage ? "Save link connection" : existing?.prefix === prefix ? "Replace connection and open" : "Connect and open" : "Review selected folder")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

export function LinkConnectionManager() {
  const { t } = useTranslation();
  const [mappings, setMappings] = useState<LinkMapping[]>([]);
  const [editing, setEditing] = useState<{ context: LinkContext; attempt: LinkAttempt }>();
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<LinkMapping>();
  const [busy, setBusy] = useState(false);
  const refresh = () => browserLinkMappings.list().then(setMappings).catch((failure) => setError(browserLinkMappings.error(failure).message));
  useEffect(() => { void refresh(); }, []);
  return <section className="grid gap-2">
    <h3 className="text-sm font-semibold">{t("Link connections")}</h3>
    {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
    {!mappings.length ? <p className="text-sm text-muted-foreground">{t("No saved link connections. Open a missing local link to connect its folder.")}</p> : mappings.map((mapping) => <div key={mapping.id} className="grid gap-2 border-b border-border py-2 text-sm">
      <p className="break-all">{mapping.sourceLabel}: {mapping.prefix} → {mapping.label}</p>
      <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing({ context: { scopeId: mapping.scopeId, label: mapping.sourceLabel, root: mapping.handle, path: "", documentId: "" }, attempt: { location: { path: mapping.example, fragment: "", absolute: !mapping.example.startsWith("./") }, mapping } })}>{t("Change link connection")}</Button><Button size="sm" variant="ghost" onClick={() => setRemoving(mapping)}>{t("Remove link connection")}</Button></div>
    </div>)}
    {editing ? <LocalLinkDialog {...editing} manage onClose={() => { setEditing(undefined); void refresh(); }} onOpen={() => { setEditing(undefined); void refresh(); }} /> : null}
    <Dialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) setRemoving(undefined); }}><DialogContent>
      <DialogHeader><DialogTitle>{t("Remove link connection")}</DialogTitle><DialogDescription>{t("Remove this saved connection? Files and Markdown links will stay unchanged.")}</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setRemoving(undefined)}>{t("Cancel")}</Button><Button disabled={busy} onClick={() => {
        setBusy(true); void browserLinkMappings.remove(removing!).then(() => { setRemoving(undefined); return refresh(); }).catch((failure) => setError(browserLinkMappings.error(failure).message)).finally(() => setBusy(false));
      }}>{t("Remove link connection")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
