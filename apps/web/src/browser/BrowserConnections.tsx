import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceSummary } from "@alpha-kanban/shared";
import { Download, Folder, FolderOpen, FolderPlus, Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "../i18n";
import { ProjectLists, StartPageNavigation } from "../components/ProjectLauncher";
import { SkillGuide } from "../components/SkillGuide";
import { StartPageHeader, WorkspaceButton, WorkspaceSwitcherTrigger } from "../components/WorkspaceNavigation";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { browserRepository, browserSupported, type Connection, type RecoveryRecord } from "./repository";
import { appActivity } from "../pwa/activity";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { TourHelp, useScreenTour } from "../onboarding/ScreenTour";

const connectionKey = ["browser-connections"];
const recoveryKey = ["browser-recoveries"];
type SelectProject = (id: string) => Promise<void>;

function useBrowserActions() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    browserRepository.invalidateListings();
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    await queryClient.invalidateQueries({ queryKey: connectionKey });
    await queryClient.invalidateQueries({ queryKey: recoveryKey });
    await queryClient.invalidateQueries({ queryKey: ["browser-folder-permission"] });
    await queryClient.invalidateQueries({ queryKey: ["document-sets"] });
    await queryClient.invalidateQueries({ queryKey: ["all-tickets"] });
  };
  const run = async (action: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { await appActivity.run(async () => { await action(); await refresh(); }); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  // Call the picker synchronously from the click handler; permission prompts need user activation.
  const pick = (kind: Connection["kind"], onSelect?: SelectProject) => run(async () => {
    const handle = await window.showDirectoryPicker({ mode: "read", id: "alpha-kanban-" + kind });
    const connection = await browserRepository.connect(handle, kind);
    if (kind === "project" && onSelect) {
      const { workspaces } = await browserRepository.workspaces();
      for (const workspace of workspaces) {
        if ((await browserRepository.projectConnection(workspace.id)).id === connection.id) { await onSelect(workspace.id); break; }
      }
    }
  });
  return { error, busy, run, pick, refresh };
}

function ErrorText({ message }: { message: string }) {
  const { t } = useTranslation();
  return message ? <p role="alert" className="text-sm text-destructive">{t(message)}</p> : null;
}

export function BrowserStartPage({ autoOpen, onAutoOpen, onSelect, workspaces, error, isLoading }: {
  autoOpen: boolean; onAutoOpen: (value: boolean) => void; onSelect: SelectProject; workspaces: WorkspaceSummary[]; error: unknown; isLoading?: boolean;
}) {
  const { t } = useTranslation();
  const actions = useBrowserActions();
  const supported = browserSupported();
  const connections = useQuery({ queryKey: connectionKey, queryFn: () => browserRepository.connections(), retry: false });
  const roots = connections.data?.filter((connection) => connection.kind === "root") ?? [];
  const tour = useScreenTour("start", {
    enabled: supported && !actions.busy,
    eligible: connections.isSuccess && !isLoading && !error && !actions.error && connections.data.length === 0 && workspaces.length === 0,
  });
  return <div className="ak-start-page">
    <StartPageNavigation help={<TourHelp tour={tour} />} />
    <div className="ak-start-content">
    <StartPageHeader autoOpen={autoOpen} onAutoOpen={onAutoOpen}>
      <Button data-tour="open-project" size="sm" disabled={!supported || actions.busy} onClick={() => void actions.pick("project", onSelect)}><FolderOpen />{t("Open project")}</Button>
      <Button data-tour="register-workspace" size="sm" disabled={!supported || actions.busy} variant="outline" onClick={() => void actions.pick("root")}><FolderPlus />{t("Register workspace")}</Button>
      <BrowserNewProject />
    </StartPageHeader>
    {!supported ? <ErrorText message="Open this page in desktop Chrome over HTTPS or localhost." /> : null}
    <ErrorText message={actions.error || (error instanceof Error ? error.message : "")} />
    <ProjectLists workspaces={workspaces} onSelect={onSelect} isLoading={isLoading} reconnect={(workspace) => <BrowserReconnect workspaceId={workspace.id} />} />
    <section className="ak-start-workspaces" aria-label={t("Registered workspaces")}>
      <div data-tour="registered-workspaces" className="ak-start-section-heading">
        <h2><Folder className="size-4" aria-hidden="true" />{t("Registered workspaces")} <Badge variant="muted">{roots.length}</Badge></h2>
        <span className="ak-start-workspace-names">{roots.map((connection) => connection.name).join(" / ") || t("No registered workspaces")}</span>
        <BrowserFilesMenu triggerLabel="Manage" />
      </div>
      <ErrorText message={connections.error instanceof Error ? connections.error.message : ""} />
      <p>{t("Register a workspace to discover its immediate subfolders as projects. You can also open one project directly.")}</p>
    </section>
    <BrowserSkillGuide />
    </div>
  </div>;
}

function ProjectList({ workspaces, onSelect, selectedWorkspaceId }: { workspaces: WorkspaceSummary[]; onSelect: SelectProject; selectedWorkspaceId?: string }) {
  const actions = useBrowserActions();
  return <div className="grid gap-1">
    <ErrorText message={actions.error} />
    {workspaces.map((workspace) => <div key={workspace.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <WorkspaceButton workspace={workspace} isSelected={workspace.id === selectedWorkspaceId} disabled={actions.busy} onSelect={() => actions.run(() => onSelect(workspace.id))} />
      {!workspace.isAvailable ? <BrowserReconnect workspaceId={workspace.id} /> : null}
    </div>)}
  </div>;
}

export function BrowserProjectSwitcher({ onSelect, selectedWorkspaceId, workspaces }: { onSelect: SelectProject; selectedWorkspaceId: string; workspaces: WorkspaceSummary[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const actions = useBrowserActions();
  const select: SelectProject = async (id) => { await onSelect(id); setOpen(false); };
  return <div className="min-w-0 flex-1" aria-label={t("Projects")}>
    <WorkspaceSwitcherTrigger workspace={workspaces.find((workspace) => workspace.id === selectedWorkspaceId)} onClick={() => setOpen(true)} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader><DialogTitle>{t("Switch project")}</DialogTitle><DialogDescription>{t("Connected folders in this browser")}</DialogDescription></DialogHeader>
        <DialogBody className="pb-5">
          <div className="grid gap-3">
            <Button variant="outline" disabled={!browserSupported() || actions.busy} onClick={() => void actions.pick("project", select)}><FolderOpen />{t("Open project")}</Button>
            <ErrorText message={actions.error} /><ProjectList workspaces={workspaces} onSelect={select} selectedWorkspaceId={selectedWorkspaceId} />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  </div>;
}

export function BrowserReconnect({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const actions = useBrowserActions();
  const connection = useQuery({ queryKey: ["browser-project-connection", workspaceId], queryFn: () => browserRepository.projectConnection(workspaceId), retry: false });
  return <div className="grid gap-2">
    {connection.data ? <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => void actions.run(async () => {
      if (await connection.data!.handle.requestPermission({ mode: "read" }) !== "granted") throw new Error("Folder access was not granted.");
    })}><Link2 />{t("Reconnect folder")}</Button> : <p className="text-xs text-muted-foreground">{t("Reconnect the original folder from Start.")}</p>}
    <ErrorText message={actions.error} />
  </div>;
}

export function BrowserFilesMenu({ triggerLabel = "Local folders" }: { triggerLabel?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const actions = useBrowserActions();
  const connections = useQuery({ queryKey: connectionKey, queryFn: () => browserRepository.connections(), retry: false });
  const recoveries = useQuery({ queryKey: recoveryKey, queryFn: () => browserRepository.recoveries(), retry: false });
  const [removing, setRemoving] = useState<Connection>();
  return <>
    <Button data-tour="local-folders" variant="outline" size="sm" onClick={() => setOpen(true)}><Link2 />{t(triggerLabel)}{recoveries.data?.length ? <span role="status">({t("Recovery pending")}: {recoveries.data.length})</span> : null}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Local folders")}</DialogTitle><DialogDescription>{t("Connections and board order are saved only in this browser and site address.")}</DialogDescription></DialogHeader>
        <DialogBody><div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!browserSupported() || actions.busy} onClick={() => void actions.pick("root")}><FolderPlus />{t("Connect workspace root")}</Button>
            <Button variant="ghost" onClick={() => void actions.refresh()}><RefreshCw />{t("Refresh")}</Button>
          </div>
          <ErrorText message={actions.error || (connections.error instanceof Error ? connections.error.message : "") || (recoveries.error instanceof Error ? recoveries.error.message : "")} />
          {connections.data?.map((connection) => <div key={connection.id} className="flex flex-wrap items-center gap-2 border-b border-border py-2">
            <span className="min-w-0 flex-1 break-all text-sm">{connection.name} <span className="text-muted-foreground">({t(connection.kind === "root" ? "Workspace root" : "Project")})</span></span>
            <FolderPermission connection={connection} />
            <Button variant="outline" size="sm" disabled={actions.busy} onClick={() => void actions.run(async () => {
              if (await connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Folder access was not granted.");
            })}><Link2 />{t("Allow editing")}</Button>
            <Button variant="ghost" size="icon" aria-label={t("Disconnect folder")} title={t("Disconnect folder")} onClick={() => setRemoving(connection)}><Trash2 /></Button>
          </div>)}
          <h3 className="text-sm font-semibold">{t("Recovery records")}</h3>
          {!recoveries.data?.length ? <p className="text-sm text-muted-foreground">{t("No pending recovery records.")}</p> : recoveries.data.map((record) => <Recovery key={record.id} record={record} />)}
        </div></DialogBody>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t("Close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(removing)} onOpenChange={(value) => { if (!value) setRemoving(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Disconnect folder")}</DialogTitle><DialogDescription>{t("This removes the browser connection, not files on disk. Recovery records remain.")}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setRemoving(undefined)}>{t("Cancel")}</Button><Button disabled={actions.busy} onClick={() => void actions.run(async () => { await browserRepository.disconnect(removing!.id); setRemoving(undefined); })}>{t("Disconnect")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function FolderPermission({ connection }: { connection: Connection }) {
  const { t } = useTranslation();
  const permission = useQuery({
    queryKey: ["browser-folder-permission", connection.id],
    queryFn: () => connection.handle.queryPermission({ mode: "readwrite" }),
    retry: false,
  });
  return <Badge variant="muted">{t(permission.data === "granted" ? "Editing allowed" : "Read-only")}</Badge>;
}

function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function Recovery({ record }: { record: RecoveryRecord }) {
  const { t } = useTranslation();
  const actions = useBrowserActions();
  const [review, setReview] = useState<{ hash: string; result: string }>();
  const [confirm, setConfirm] = useState(false);
  return <div className="grid gap-2 border-b border-border py-3">
    <p className="break-all text-sm">{record.path} · {record.ticketId}</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => downloadText(record.before, record.id + "-before.md")}><Download />{t("Original copy")}</Button>
      <Button size="sm" variant="outline" onClick={() => downloadText(record.intended, record.id + "-intended.md")}><Download />{t("Intended copy")}</Button>
      <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => void actions.run(async () => {
        const current = await browserRepository.recoveryDocument(record);
        setReview({ hash: current.file.hash, result: current.file.hash === record.intendedHash ? "The change is already saved." : current.file.hash === record.beforeHash ? "The original file is unchanged." : "The current file differs from both copies." });
      })}><RefreshCw />{t("Check current file")}</Button>
    </div>
    {review ? <><p className="text-sm">{t(review.result)}</p><Button size="sm" variant="outline" onClick={() => setConfirm(true)}>{t("Finish recovery review")}</Button></> : null}
    <ErrorText message={actions.error} />
    <Dialog open={confirm} onOpenChange={setConfirm}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Finish recovery review")}</DialogTitle><DialogDescription>{t("Remove these recovery copies without changing the file? Download any copies you need first.")}</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>{t("Cancel")}</Button><Button disabled={actions.busy} onClick={() => void actions.run(async () => { await browserRepository.dismissRecovery(record, review!.hash); setConfirm(false); })}>{t("Confirm")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function BrowserNewProject() {
  const { t } = useTranslation();
  const actions = useBrowserActions();
  const connections = useQuery({ queryKey: connectionKey, queryFn: () => browserRepository.connections(), retry: false });
  const roots = connections.data?.filter((connection) => connection.kind === "root") ?? [];
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState("");
  const [name, setName] = useState("");
  usePwaDraft(open && Boolean(name));
  const selected = roots.find((item) => item.id === root);
  return <>
    <Button data-tour="new-project" size="sm" variant="outline" disabled={!roots.length} onClick={() => setOpen(true)}><Plus />{t("New project")}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>{t("New project")}</DialogTitle><DialogDescription>{t("Create a project folder. Git initialization is done in your terminal.")}</DialogDescription></DialogHeader>
      <DialogBody><div className="grid gap-3">
        <label className="grid gap-2 text-sm">{t("Location")}<Select value={root} onValueChange={setRoot}><SelectTrigger><SelectValue placeholder={t("Select a root")} /></SelectTrigger><SelectContent>{roots.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>
        <label className="grid gap-2 text-sm">{t("Project name")}<Input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <ErrorText message={actions.error} />
      </div></DialogBody>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button disabled={!selected || !name.trim() || actions.busy} onClick={() => void actions.run(async () => {
        if (await selected!.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Folder access was not granted.");
        await browserRepository.createProject(selected!, name); setName(""); setOpen(false);
      })}>{t("Create project")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}

export function BrowserSkillGuide() {
  return <SkillGuide />;
}
