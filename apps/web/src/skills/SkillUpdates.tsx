import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Copy, FolderOpen, Maximize2, Minimize2, PackageCheck, RotateCcw, X } from "lucide-react";
import { useTranslation } from "../i18n";
import { RELEASE_CHANNELS } from "../../release-channel.mjs";
import { skillAgentRequest, skillChannelLabel } from "./distribution";
import { Button, buttonVariants } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { PanelResizeHandles } from "../components/ui/PanelResizeHandles";
import { usePanelPresentation, type PanelPreferences } from "../components/ui/usePanelPresentation";
import { ChannelBadge } from "../components/AppBrand";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { loadSkillBundle } from "./bundle";
import { skillRepository, type SkillConnection, type SkillRecovery, type SkillReview } from "./repository";
import { SkillUpdateReview, SkillBackupList, serializeSkillBackup } from "./SkillReviewPanels";
import { SkillReinstallReview } from "./SkillReinstallReview";
import { SkillFolderConnection } from "./SkillFolderConnection";
import { droppedSkillFolder, supportsSkillFolderDrop } from "./folderDrop";
import { TourButton, useScreenTour } from "../onboarding/ScreenTour";

const presentationPreferences: PanelPreferences = {
  modeKey: "alpha-kanban.skillUpdatesMode",
  sizeKey: "alpha-kanban.skillUpdatesModalSize",
  defaultMode: "modal",
  defaultSize: { width: 960, height: 760 },
};

export function SkillUpdatesButton({ placement = "panel" }: { placement?: "panel" | "toolbar" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const toolbar = placement === "toolbar";
  return <>
    <Button ref={trigger} data-tour="skill-updates" data-skill-updates="" size="sm" variant={toolbar ? "ghost" : "outline"} title={toolbar ? t("Skill updates") : undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {toolbar ? <PackageCheck aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}<span className={toolbar ? "ak-toolbar-label" : undefined}>{t(toolbar ? "Skill updates" : "Register or manage an installed skill")}</span>
    </Button>
    <SkillUpdates open={open} onOpenChange={setOpen} returnFocus={trigger.current} />
  </>;
}

export function SkillUpdates({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus?: HTMLElement | null }) {
  const { t } = useTranslation();
  const presentation = usePanelPresentation(presentationPreferences);
  const [connection, setConnection] = useState<SkillConnection>();
  const [candidate, setCandidate] = useState<FileSystemDirectoryHandle>();
  const [needsAccess, setNeedsAccess] = useState(false);
  const [review, setReview] = useState<SkillReview>();
  const [backups, setBackups] = useState<SkillRecovery[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [restoreId, setRestoreId] = useState<string>();
  const [reinstallReview, setReinstallReview] = useState<SkillReview>();
  const [reinstallConfirmed, setReinstallConfirmed] = useState(false);
  const tourContainer = useRef<HTMLDivElement>(null);
  const resizeEscaped = useRef(false);
  const tour = useScreenTour("skill", { enabled: open && !busy, eligible: false, scope: `${connection?.id ?? "none"}:${candidate?.name ?? ""}:${reinstallReview ? "reinstall" : review?.state ?? "connect"}:${restoreId ?? ""}`, container: tourContainer });
  const generation = useRef(0);
  const requestInput = useRef<HTMLTextAreaElement>(null);
  const request = skillAgentRequest(t, "update");
  usePwaDraft(open && (busy || Boolean(candidate) || Boolean(restoreId) || Boolean(reinstallReview) || review?.state === "update"));
  useEffect(() => { if (!open) presentation.stopResize(); }, [open, presentation.stopResize]);

  function report(reason: unknown) {
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    if (reason instanceof DOMException && reason.name === "NotAllowedError") setError("Allow access to the registered skill folder to continue.");
    else if (reason instanceof DOMException && reason.name === "QuotaExceededError") setError("The backup could not be saved. Free browser storage before trying again.");
    else setError(reason instanceof Error ? reason.message : "Skill operation failed. Review the backup before trying again.");
  }
  async function load(token: number, inspect = true) {
    const saved = await skillRepository.connection();
    const records = await skillRepository.recoveries();
    if (generation.current !== token) return;
    setConnection(saved); setBackups(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    const writable = saved ? await saved.handle.queryPermission({ mode: "readwrite" }).catch(() => "denied") : "granted";
    if (generation.current !== token) return;
    setNeedsAccess(writable !== "granted");
    if (saved && await saved.handle.queryPermission({ mode: "read" }).catch(() => "denied") !== "granted") return;
    if (generation.current !== token) return;
    if (saved && inspect && !records.some((record) => record.state === "pending")) {
      const result = await skillRepository.inspect(saved, await loadSkillBundle());
      if (generation.current === token) setReview(result);
    }
  }
  useEffect(() => {
    const token = ++generation.current;
    setCandidate(undefined); setNeedsAccess(false); setReview(undefined); setError(""); setNotice(""); setConfirmed(false); setRestoreId(undefined); setReinstallReview(undefined); setReinstallConfirmed(false);
    if (!open) return;
    setBusy(true);
    void load(token).catch((reason) => { if (generation.current === token) report(reason); }).finally(() => { if (generation.current === token) setBusy(false); });
    return () => { generation.current++; };
  }, [open]);

  async function action(run: () => Promise<unknown>, success = "") {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setConfirmed(false); setReview(undefined); setReinstallReview(undefined); setReinstallConfirmed(false);
    const token = generation.current;
    try {
      await run();
      if (generation.current !== token) return;
      setNotice(success); setRestoreId(undefined);
      await load(token);
    } catch (reason) {
      if (generation.current === token) { report(reason); await load(token, false).catch(() => undefined); }
    } finally { if (generation.current === token) setBusy(false); }
  }
  function choose() {
    if (!window.showDirectoryPicker) { setError("Open this page in desktop Chrome over HTTPS or localhost."); return; }
    const token = generation.current;
    void action(async () => {
      const handle = await window.showDirectoryPicker({ id: "alpha-kanban-skill", mode: "readwrite" });
      if (generation.current !== token) return;
      if (await handle.queryPermission({ mode: "readwrite" }) !== "granted") { setCandidate(handle); return; }
      await skillRepository.connect(handle);
      if (generation.current === token) setCandidate(undefined);
    });
  }
  function receiveDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (busy || pending) return;
    // Capture while the browser still exposes the drag data store.
    const received = droppedSkillFolder(event.dataTransfer.items);
    const token = generation.current;
    setBusy(true); setCandidate(undefined); setError(""); setNotice(""); setConfirmed(false); setReinstallReview(undefined); setReinstallConfirmed(false); setRestoreId(undefined);
    void received.then((handle) => { if (generation.current === token) setCandidate(handle); })
      .catch((reason) => { if (generation.current === token) report(reason); })
      .finally(() => { if (generation.current === token) setBusy(false); });
  }
  function allowCandidate() {
    if (!candidate || pending) return;
    const selected = candidate;
    const token = generation.current;
    void action(async () => {
      if (await selected.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Access was not allowed. Your existing connection is unchanged. Try again or cancel the selection.");
      if (generation.current !== token) return;
      await skillRepository.connect(selected);
      if (generation.current === token) setCandidate(undefined);
    });
  }
  function exportBackup(record: SkillRecovery) {
    const url = URL.createObjectURL(new Blob([serializeSkillBackup(record)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `implementation-ledger-backup-${record.id}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  const pending = backups.some((record) => record.state === "pending");
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { presentation.stopResize(); onOpenChange(value); } }}>
    <DialogContent ref={tourContainer} layout="custom" showCloseButton={false} className="ak-resizable-dialog" data-mode={presentation.mode} data-resizing={presentation.isResizing || undefined}
      style={{ "--dialog-width": `${presentation.width}px`, "--dialog-height": `${presentation.height}px` } as CSSProperties}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = busy || pending ? "none" : "copy"; } }} onDrop={receiveDrop}
      onEscapeKeyDown={(event) => {
        if (presentation.isResizing) { event.preventDefault(); resizeEscaped.current = tour.active; presentation.stopResize(); }
        else if (tour.active) event.preventDefault();
        else if (busy) event.preventDefault();
      }}
      onKeyUpCapture={(event) => {
        if (event.key === "Escape" && resizeEscaped.current) { resizeEscaped.current = false; event.stopPropagation(); }
      }}
      onInteractOutside={(event) => { if (busy || presentation.isResizing || tour.active) event.preventDefault(); }}
      onCloseAutoFocus={returnFocus ? (event) => { event.preventDefault(); returnFocus.focus({ preventScroll: true }); } : undefined}>
      <div className="ak-resizable-dialog-frame">
        <DialogHeader>
          <div className="ak-resizable-dialog-heading">
            <div className="ak-channel-title"><DialogTitle>{t("Skill updates")}</DialogTitle><ChannelBadge /></div>
            <div className="ak-drawer-actions"><TourButton tour={tour} labelKey="Tour this dialog" />
              <Button data-tour-layout size="iconSm" variant="ghost" disabled={presentation.mode === "full"} aria-label={t("Reset size")} title={t("Reset size")} onClick={presentation.resetSize}><RotateCcw aria-hidden="true" /></Button>
              <Button data-tour-layout size="iconSm" variant="ghost" aria-label={t(presentation.mode === "full" ? "Restore dialog size" : "Expand dialog")} title={t(presentation.mode === "full" ? "Restore dialog size" : "Expand dialog")}
                onClick={() => presentation.mode === "full" ? presentation.restorePeek() : presentation.setMode("full")}>
                {presentation.mode === "full" ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              </Button>
              <Button size="iconSm" variant="ghost" disabled={busy} aria-label={t("Close")} title={t("Close")} onClick={() => { presentation.stopResize(); onOpenChange(false); }}><X aria-hidden="true" /></Button>
            </div>
          </div>
          <DialogDescription>{t("Connect your installed skill folder to review changes and approve updates.")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-5 pb-5" aria-busy={busy}>
          <SkillFolderConnection connection={connection} candidate={candidate} needsAccess={needsAccess} busy={busy} recovery={pending}
            dropSupported={supportsSkillFolderDrop()} onChoose={choose} onAllow={allowCandidate} onCancel={() => { setCandidate(undefined); setError(""); }}
            onCheck={() => { if (!connection) return; void action(async () => {
              if (await connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
            }); }} onDisconnect={() => void action(() => skillRepository.disconnect())} />
          {!review && !reinstallReview ? <p className="text-xs text-muted-foreground">{t(skillChannelLabel(__APP_RELEASE__.channel))}{" · "}{t("Bundle ID")}{": "}<code>{__APP_RELEASE__.skillBundle}</code></p> : null}
          {busy ? <p role="status" className="text-sm text-muted-foreground">{t("Checking or saving skill files…")}</p> : null}
          {error ? <p role="alert" className="break-words text-sm text-destructive">{t(error, { defaultValue: t("Skill operation failed. Review the backup before trying again.") })}</p> : null}
          {notice ? <p role="status" className="text-sm">{t(notice)}</p> : null}
          {review && !candidate && !reinstallReview && <SkillUpdateReview review={review} busy={busy} pending={pending} confirmed={confirmed} setConfirmed={setConfirmed}
            onApply={() => void action(async () => {
                if (await review.connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
                await skillRepository.apply(review);
              }, "Skill files saved and verified. Check that your AI tool recognizes the updated skill.")} onReinstall={() => {
              setReinstallReview(review); setReinstallConfirmed(false); setConfirmed(false); setRestoreId(undefined);
            }} />}
          {reinstallReview ? <SkillReinstallReview review={reinstallReview} busy={busy} confirmed={reinstallConfirmed} onConfirmedChange={setReinstallConfirmed}
            onCancel={() => { setReinstallReview(undefined); setReinstallConfirmed(false); }}
            onApply={() => {
              if (!reinstallConfirmed) return;
              void action(async () => {
                if (await reinstallReview.connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
                await skillRepository.reinstall(reinstallReview);
              }, "Skill files saved and verified. Check that your AI tool recognizes the updated skill.");
            }} /> : null}
          {backups.length > 0 && <SkillBackupList backups={backups} busy={busy || Boolean(candidate)} pending={pending} restoreId={restoreId}
            onStart={id => { setRestoreId(id); setReinstallReview(undefined); setReinstallConfirmed(false); }}
            exportBackup={exportBackup} onCancel={() => setRestoreId(undefined)} onRestore={record => void action(async () => {
                  if (await record.connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
                  await skillRepository.restore(record.id);
                }, "Original skill files restored and verified.")} />}
          {__APP_RELEASE__.channel === "canary" ? <details className="space-y-3 text-sm">
            <summary className="ak-focus-ring cursor-pointer">{t("Return to the stable skill")}</summary>
            <p>{t("Finish AI tasks and skill changes in this app. Open the stable app, register the same installed skill folder, and review its provided skill before confirming replacement.")}</p>
            <p>{t("The stable app makes its own backup of the current files; it does not need this app’s backups. Restore a backup in the app that created it.")}</p>
            <p>{t("Replacing a skill does not revert project documents or personal settings.")}</p>
            <a href={RELEASE_CHANNELS.stable.origin + "/"} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Open stable app")}</a>
          </details> : null}
          <details className="space-y-3 text-sm">
            <summary className="ak-focus-ring cursor-pointer">{t("Compare with your AI tool instead")}</summary>
            <Textarea ref={requestInput} readOnly value={request} aria-label={t("Update request for your AI tool")} className="min-h-40" />
            <Button size="sm" variant="outline" onClick={async () => {
              try { await navigator.clipboard.writeText(request); setNotice("Update request copied. Paste it into your AI tool to compare your installation."); }
              catch { requestInput.current?.focus(); requestInput.current?.select(); setNotice("Text selected. Copy it manually."); }
            }}><Copy />{t("Copy request")}</Button>
          </details>
        </DialogBody>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("Close")}</Button></DialogFooter>
      </div>
      <PanelResizeHandles presentation={presentation} tourLayout label={(edge) => t("Resize dialog {{edge}}", { edge: t(edge) })} />
    </DialogContent>
  </Dialog>;
}
