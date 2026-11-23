import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { RemoveLinkDialog, SavedLinkRow } from "./SavedLinkRow";
import { TourButton, useScreenTour } from "../onboarding/ScreenTour";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { browserLinkMappings } from "./repository";
import { LocalLinkDialogView } from "./LocalLinkDialogView";
import { folderPrefixes, LocalLinkError } from "./linkPaths";
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
  const review = () => run(async () => setPreview(await browserLinkMappings.preview(context, attempt.location, prefix, target!, existing?.prefix === prefix ? existing : undefined)));
  return <LocalLinkDialogView path={attempt.location.path} project={(context.origin ?? context).label}
    prefix={prefix} proposals={proposals} target={target} preview={preview} existing={existing} error={error} manage={manage}
    contentRef={tourContainer} headerAction={<TourButton tour={tour} labelKey="Tour this dialog" />} lockDismiss={tour.active}
    scan={scan} scanning={scanning} busy={busy} discover={browserLinkMappings.autoDiscover} touch={touch}
    onRefresh={() => setRefresh(value => value + 1)} onStop={stopScan} onPick={() => void chooseFolder()}
    onSelect={repo => void run(() => choose({ handle: repo.handle, label: repo.label, repo }))}
    onPrefix={setPrefix} onClose={onClose} onBack={() => { setPreview(undefined); setError(""); }}
    onSubmit={() => void (preview ? run(async () => {
      const resource = await browserLinkMappings.save(context, attempt.location, prefix, target!, preview.expected, undefined, undefined, preview);
      onOpen(resource);
    }) : review())}
    onRetry={() => void run(async () => {
      if (!existing) return;
      if (await existing.handle.requestPermission({ mode: "read" }) !== "granted") throw new LocalLinkError("permission", "Allow access to the saved link folder, or choose another folder.");
      onOpen(await browserLinkMappings.retry(existing, attempt.location));
    })}
    onReviewOverlap={() => { setExisting(preview?.overlap); setTarget(undefined); setPreview(undefined); setPrefix(""); }} />;
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
    {paths.data?.map(mapping => <SavedLinkRow key={mapping.id} mapping={mapping} onRemove={() => setRemoving(mapping)}
      onChange={() => setEditing({ context: { scopeId: mapping.scopeId, label: mapping.sourceLabel, root: mapping.handle, path: "", documentId: "" }, attempt: { location: { path: mapping.example, fragment: "", absolute: !mapping.example.startsWith("./") }, mapping } })} />)}
    {revisions.data?.map(connection => <div key={connection.key} className="grid min-w-0 gap-2 border-b border-border py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="muted">{t("Git revision link")}</Badge>
        <span className="break-all text-muted-foreground">{connection.projectName ?? t(connection.scope === "/all" ? "All tickets" : "Outside a project")}</span></div>
      <p className="break-all"><code>{connection.repository}</code> → {connection.folder}</p>
      <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setRemoving(connection)}>{t("Remove link connection")}</Button>
    </div>)}
    {editing ? <LocalLinkDialog {...editing} manage onClose={() => { setEditing(undefined); void refresh(); }} onOpen={() => { setEditing(undefined); void refresh(); }} /> : null}
    <RemoveLinkDialog open={Boolean(removing)} busy={busy} onClose={() => setRemoving(undefined)} onRemove={remove} />
  </section>;
}
