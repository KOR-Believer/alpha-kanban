import { useEffect, useRef, useState } from "react";
import { Copy, Download, FolderOpen, PackageCheck, RefreshCw, RotateCcw, Unplug } from "lucide-react";
import { useTranslation } from "../i18n";
import { RELEASE_CHANNELS } from "../../release-channel.mjs";
import { skillAgentRequest, skillChannelLabel } from "./distribution";
import { SkillReplacementNotice } from "./SkillReplacementNotice";
import { SkillChanges } from "./SkillChanges";
import { Button, buttonVariants } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ChannelBadge } from "../components/AppBrand";
import { usePwaDraft } from "../pwa/usePwaDraft";
import { loadSkillBundle } from "./bundle";
import { skillRepository, type SkillConnection, type SkillRecovery, type SkillReview } from "./repository";
import { SkillReinstallReview } from "./SkillReinstallReview";
import { formatSkillBytes, skillBackupContentBytes } from "./backupSize";

export function SkillUpdatesButton({ placement = "panel" }: { placement?: "panel" | "toolbar" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const toolbar = placement === "toolbar";
  return <>
    <Button ref={trigger} data-skill-updates="" size="sm" variant={toolbar ? "ghost" : "outline"} title={toolbar ? t("Skill updates") : undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {toolbar ? <PackageCheck aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}<span className={toolbar ? "ak-toolbar-label" : undefined}>{t(toolbar ? "Skill updates" : "Register or manage an installed skill")}</span>
    </Button>
    <SkillUpdates open={open} onOpenChange={setOpen} returnFocus={trigger.current} />
  </>;
}

export function SkillUpdates({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus?: HTMLElement | null }) {
  const { t, i18n } = useTranslation();
  const [connection, setConnection] = useState<SkillConnection>();
  const [review, setReview] = useState<SkillReview>();
  const [backups, setBackups] = useState<SkillRecovery[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [restoreId, setRestoreId] = useState<string>();
  const [reinstallReview, setReinstallReview] = useState<SkillReview>();
  const [reinstallConfirmed, setReinstallConfirmed] = useState(false);
  const generation = useRef(0);
  const requestInput = useRef<HTMLTextAreaElement>(null);
  const request = skillAgentRequest(t, "update");
  usePwaDraft(open && (busy || Boolean(restoreId) || Boolean(reinstallReview) || review?.state === "update"));

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
    if (saved && inspect && !records.some((record) => record.state === "pending")) {
      const result = await skillRepository.inspect(saved, await loadSkillBundle());
      if (generation.current === token) setReview(result);
    }
  }
  useEffect(() => {
    const token = ++generation.current;
    setReview(undefined); setError(""); setNotice(""); setConfirmed(false); setRestoreId(undefined); setReinstallReview(undefined); setReinstallConfirmed(false);
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
    void action(async () => {
      const handle = await window.showDirectoryPicker({ id: "alpha-kanban-skill", mode: "readwrite" });
      await skillRepository.connect(handle);
    });
  }
  function exportBackup(record: SkillRecovery) {
    const data = { schema: 1, skill: "implementation-ledger", createdAt: record.createdAt, state: record.state, operation: record.operation, before: record.before, intended: record.intended };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `implementation-ledger-backup-${record.id}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  const pending = backups.some((record) => record.state === "pending");
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }} onCloseAutoFocus={returnFocus ? (event) => { event.preventDefault(); returnFocus.focus({ preventScroll: true }); } : undefined}>
      <DialogHeader><div className="ak-channel-title"><DialogTitle>{t("Skill updates")}</DialogTitle><ChannelBadge /></div><DialogDescription>{t("Choose the existing implementation-ledger folder reported by Codex and allow read and write access. Registration does not change files; each update still needs your confirmation.")}</DialogDescription></DialogHeader>
      <DialogBody className="space-y-5 pb-5" aria-busy={busy}>
        <p className="text-sm font-medium">{t(skillChannelLabel(__APP_RELEASE__.channel))}{" · "}<code>{__APP_RELEASE__.skillBundle}</code></p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy || pending} onClick={choose}><FolderOpen />{t(connection ? "Choose another skill folder" : "Register installed skill folder")}</Button>
          {connection ? <>
            <Button size="sm" variant="outline" disabled={busy || pending} onClick={() => void action(async () => {
              if (await connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
            })}><RefreshCw />{t("Check installed skill")}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void action(() => skillRepository.disconnect())}><Unplug />{t("Disconnect")}</Button>
          </> : null}
        </div>
        {connection ? <p className="break-all text-sm">{t("Registered folder")}: <strong>{connection.name}</strong></p> : <p className="text-sm text-muted-foreground">{t("Install with Codex first. You can keep using agent requests without registering a folder.")}</p>}
        {busy ? <p role="status" className="text-sm text-muted-foreground">{t("Checking or saving skill files…")}</p> : null}
        {error ? <p role="alert" className="break-words text-sm text-destructive">{t(error, { defaultValue: t("Skill operation failed. Review the backup before trying again.") })}</p> : null}
        {notice ? <p role="status" className="text-sm">{t(notice)}</p> : null}
        {review && !reinstallReview ? <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t(review.state === "current" ? "Matches this app's skill bundle" : review.state === "update" ? "An update is available for this installation" : review.state === "review" ? "Ask Codex to review compatibility before changing your skill or documents." : "This installation differs from known official bundles. Regular updates will not replace it.")}</h3>
          <p className="text-xs text-muted-foreground">{t("Target bundle")}: <code>{review.bundle.version}</code></p>
          {review.changes.length ? <SkillChanges review={review} /> : null}
          {review.state === "update" ? <>
            <p className="text-sm text-muted-foreground">{t("A full backup stays in this browser, outside the skill folder. Keep this window open until verification finishes. Multiple files cannot be replaced atomically.")}</p>
            <SkillReplacementNotice />
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><span>{t("I have stopped using this skill in Codex and reviewed the files to replace.")}</span></label>
            <Button disabled={!confirmed || busy} onClick={() => void action(async () => {
              if (await review.connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
              await skillRepository.apply(review);
            }, "Skill files saved and verified. Reopen Codex to check that it recognizes the skill.")}><RefreshCw />{t("Back up and update skill")}</Button>
          </> : null}
          {review.state === "custom" && !pending ? <Button variant="outline" disabled={busy} onClick={() => {
            setReinstallReview(review); setReinstallConfirmed(false); setConfirmed(false); setRestoreId(undefined);
          }}><RotateCcw />{t("Review reinstall")}</Button> : null}
        </section> : null}
        {reinstallReview ? <SkillReinstallReview review={reinstallReview} busy={busy} confirmed={reinstallConfirmed} onConfirmedChange={setReinstallConfirmed}
          onCancel={() => { setReinstallReview(undefined); setReinstallConfirmed(false); }}
          onApply={() => {
            if (!reinstallConfirmed) return;
            void action(async () => {
              if (await reinstallReview.connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
              await skillRepository.reinstall(reinstallReview);
            }, "Skill files saved and verified. Reopen Codex to check that it recognizes the skill.");
          }} /> : null}
        {backups.length ? <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("Skill backups")}</h3>
          <p className="text-xs text-muted-foreground">{t("Total backup file contents: {{size}}.", { size: formatSkillBytes(backups.reduce((total, record) => total + skillBackupContentBytes(record), 0), i18n.language) })}</p>
          <p className="text-xs text-muted-foreground">{t("Backups stay on this site in this browser and are not automatically deleted, even after restoring or disconnecting.")}</p>
          <p className="text-xs text-muted-foreground">{t("Disconnecting keeps these backups. Export a copy before clearing browser data. Restore will stop if files have changed outside this app.")}</p>
          <ul className="divide-y divide-border">{backups.map((record) => <li key={record.id} className="space-y-2 py-3">
            <p className="text-sm">{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.createdAt))} · {t(record.state === "pending" ? "Recovery required" : record.state === "restored" ? "Restored" : "Update verified")}</p>
            <p className="text-xs text-muted-foreground">{t("Backup file contents: {{size}} (before and after).", { size: formatSkillBytes(skillBackupContentBytes(record), i18n.language) })}</p>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => exportBackup(record)}><Download />{t("Export backup")}</Button>
              {record.state !== "restored" ? <Button size="sm" variant="outline" disabled={busy || (pending && record.state !== "pending")} onClick={() => { setRestoreId(record.id); setReinstallReview(undefined); setReinstallConfirmed(false); }}><RotateCcw />{t("Restore backup")}</Button> : null}</div>
            {restoreId === record.id ? <div className="space-y-2">
              <p className="text-sm">{t("Stop using this skill in Codex before restoring. Only files matching the recorded copies will be replaced.")}</p>
              <SkillReplacementNotice />
              <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void action(async () => {
                if (await record.connection.handle.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("Allow access to the registered skill folder to continue.");
                await skillRepository.restore(record.id);
              }, "Original skill files restored and verified.")}><RotateCcw />{t("Confirm restore")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setRestoreId(undefined)}>{t("Cancel")}</Button></div>
            </div> : null}
          </li>)}</ul>
        </section> : null}
        {__APP_RELEASE__.channel === "canary" ? <details className="space-y-3 text-sm">
          <summary className="ak-focus-ring cursor-pointer">{t("Return to the stable skill")}</summary>
          <p>{t("Finish AI tasks and skill changes in this app. Open the stable app, register the same installed skill folder, and review its provided skill before confirming replacement.")}</p>
          <p>{t("The stable app makes its own backup of the current files; it does not need this app’s backups. Restore a backup in the app that created it.")}</p>
          <p>{t("Replacing a skill does not revert project documents or personal settings.")}</p>
          <a href={RELEASE_CHANNELS.stable.origin + "/"} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Open stable app")}</a>
        </details> : null}
        <details className="space-y-3 text-sm">
          <summary className="ak-focus-ring cursor-pointer">{t("Compare with Codex instead")}</summary>
          <Textarea ref={requestInput} readOnly value={request} aria-label={t("Update request for Codex")} className="min-h-40" />
          <Button size="sm" variant="outline" onClick={async () => {
            try { await navigator.clipboard.writeText(request); setNotice("Update request copied. Paste it into Codex to compare your installation."); }
            catch { requestInput.current?.focus(); requestInput.current?.select(); setNotice("Text selected. Copy it manually."); }
          }}><Copy />{t("Copy request")}</Button>
        </details>
      </DialogBody>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("Close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
