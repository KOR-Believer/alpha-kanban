import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "@tanstack/react-router";
import { BookOpen, RefreshCw, X } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button, buttonVariants } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ChannelBadge } from "../components/AppBrand";
import { pwaClient } from "./client";
import { appActivity } from "./activity";
import { SkillUpdates } from "../skills/SkillUpdates";
import { useAppSkillUpdate } from "../skills/useAppSkillUpdate";
import { skillError } from "../skills/repository";
import { SkillComparisonSummary } from "../skills/SkillComparisonSummary";
import { SkillReplacementNotice } from "../skills/SkillReplacementNotice";
import { SkillChanges } from "../skills/SkillChanges";
import { availableReleaseHref, markNotified, markReleasesRead, observeRelease, releaseRecords, releaseTitle, unreadReleases, wasNotified, type ReleaseInfo, type ReleaseRecord } from "./releases";

const OPEN_EVENT = "alpha-kanban:release-notes";
// Vite replaces this define with an object literal; keep its identity across renders.
const RUNNING_RELEASE = __APP_RELEASE__;
export function openReleaseNotes(returnFocus?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: returnFocus }));
}
function quietScreen() {
  return document.visibilityState === "visible" && !appActivity.busy &&
    !document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], .driver-overlay, [data-tour-offer]') &&
    !document.activeElement?.matches("input, textarea, [contenteditable=true]");
}
type Reading = { release: ReleaseInfo; records: ReleaseRecord[]; pending: boolean; automatic: boolean };

export function ReleaseCenter({ release = RUNNING_RELEASE, enabled = __PWA_ENABLED__ }: { release?: ReleaseInfo; enabled?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const pathname = useLocation({ select: (location) => location.pathname });
  const app = useSyncExternalStore(pwaClient.subscribe, pwaClient.getSnapshot);
  const [reading, setReading] = useState<Reading | null>(null);
  const [notice, setNotice] = useState<ReleaseInfo | null>(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const resumeReading = useRef<Reading | null>(null);
  const currentReading = useRef(reading); currentReading.current = reading;
  const releaseLock = useRef<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const waiting = app.prepared?.mode === "app" ? app.prepared : undefined;
  const changed = reading?.pending && waiting?.buildId !== reading.release.buildId;
  const skill = useAppSkillUpdate(release, reading?.pending && !changed ? reading.release : undefined, enabled);
  const [confirming, setConfirming] = useState(false);
  const confirmingRef = useRef(false);
  const [applyError, setApplyError] = useState("");
  const prepared = skill.prepared?.buildId === reading?.release.buildId ? skill.prepared : undefined;

  useEffect(() => {
    if (enabled) observeRelease(release);
    return () => { releaseLock.current?.(); releaseLock.current = null; };
  }, [enabled, release]);

  useEffect(() => {
    function open(event: Event) {
      if (currentReading.current) return;
      returnFocus.current = (event as CustomEvent<HTMLElement | null>).detail;
      setNotice(null);
      setApplyError("");
      const target = waiting ?? release;
      setReading({ release: target, records: releaseRecords(target).slice().reverse(), pending: Boolean(waiting), automatic: false });
    }
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [waiting, release]);

  useEffect(() => {
    if (!enabled || reading || skillOpen) return;
    let cancelled = false;
    let claiming = false;
    const tick = async () => {
      if (claiming || cancelled || !quietScreen()) return;
      claiming = true;
      try {
        // Web Locks coordinate offers across tabs without clearing durable app data.
        if (waiting && !wasNotified(waiting) && waiting.history?.at(-1)?.notify !== false) {
          const offer = () => { if (!cancelled && quietScreen() && !wasNotified(waiting)) { markNotified(waiting); setNotice(waiting); } };
          if (navigator.locks) await navigator.locks.request("alpha-kanban:release-notice", { ifAvailable: true }, (lock) => { if (lock) offer(); });
          else offer();
        }
        if (pathname !== "/" || !document.querySelector('[data-release-start="ready"]') || !navigator.locks) return;
        await navigator.locks.request("alpha-kanban:release-dialog", { ifAvailable: true }, async (lock) => {
          const records = unreadReleases(release).reverse();
          if (!lock || cancelled || !quietScreen() || !records.length) return;
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const closed = new Promise<void>((resolve) => { releaseLock.current = resolve; });
          setNotice(null);
          setReading({ release, records, pending: false, automatic: true });
          await closed;
        });
      } finally { claiming = false; }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pathname, reading, waiting, enabled, release, skillOpen]);

  useEffect(() => {
    if (reading?.automatic && pathname !== "/") {
      setReading(null); releaseLock.current?.(); releaseLock.current = null;
    }
  }, [pathname, reading]);

  function close() {
    if (confirmingRef.current) return;
    if (reading && document.visibilityState === "visible") markReleasesRead(reading.records);
    setReading(null); releaseLock.current?.(); releaseLock.current = null;
  }
  async function apply() {
    if (!reading?.pending || changed || confirmingRef.current || !prepared || prepared.state === "checking") return;
    confirmingRef.current = true; setConfirming(true); setApplyError("");
    let approval: string | undefined;
    try {
      if (prepared.state === "update" && prepared.review) approval = await prepared.repository.approveAppUpdate(prepared.review, release.buildId, reading.release.buildId);
      else await prepared.repository.cancelAppUpdate();
      markReleasesRead(reading.records);
      if (!await pwaClient.apply(reading.release.buildId) && approval) await prepared.repository.cancelAppUpdate(approval);
    } catch (error) {
      setApplyError(skillError(error));
      if (approval) await prepared.repository.cancelAppUpdate(approval).catch(() => undefined);
    } finally { confirmingRef.current = false; setConfirming(false); }
  }
  const locale = i18n.language === "ko" ? "ko" : "en";
  return <>
    {(skill.result || skill.error || skill.finishing) && !reading && !skillOpen ? <aside role="status" className="fixed bottom-4 right-4 z-40 grid w-96 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-[var(--ak-shadow-soft)]">
      <div className="flex items-start justify-between gap-3"><p>{t(skill.finishing ? "Checking the approved skill update…" : skill.result?.state === "applied" ? "Your registered skill was backed up and updated." : skill.result ? "The app is up to date. Your skill update needs attention." : "Skill updates")}</p>
        {!skill.finishing ? <Button size="iconSm" variant="ghost" aria-label={t("Close")} onClick={() => void skill.dismissResult()}><X /></Button> : null}</div>
      {skill.result?.error || skill.error ? <p>{t(skill.result?.error || skill.error, { defaultValue: t("Skill operation failed. Review the backup before trying again.") })}</p> : null}
      {!skill.finishing ? <Button size="sm" variant="outline" onClick={() => { void skill.dismissResult(); setSkillOpen(true); }}>{t("Skill updates")}</Button> : null}
    </aside> : null}
    {notice && !reading && !skill.result && !skill.error && !skill.finishing && waiting?.buildId === notice.buildId ? <aside role="status" className="fixed bottom-4 right-4 z-40 grid max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-[var(--ak-shadow-soft)]">
      <div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">{t("An update is ready")}</p><Button size="iconSm" variant="ghost" aria-label={t("Close")} onClick={() => setNotice(null)}><X /></Button></div>
      <Button size="sm" variant="outline" onClick={(event) => openReleaseNotes(event.currentTarget)}><BookOpen />{t("View update")}</Button>
    </aside> : null}
    <Dialog open={Boolean(reading)} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto]" onEscapeKeyDown={(event) => { if (confirming) event.preventDefault(); }} onInteractOutside={(event) => { if (confirming) event.preventDefault(); }} onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (resumeReading.current) { setSkillOpen(true); return; }
        const destination = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>("[data-pwa-menu]");
        destination?.focus({ preventScroll: true });
      }}>
        <DialogHeader><div className="ak-channel-title"><DialogTitle>{t("Update history")}</DialogTitle><ChannelBadge /></div><DialogDescription>{t(reading?.pending ? "Changes in the update ready to apply" : "Changes in this app and earlier releases")}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-5 pb-4">
          {reading?.records.length ? reading.records.map((record) => <section key={record.id} className="space-y-2">
            <h3 className="text-sm font-semibold">{releaseTitle(record, locale)}</h3>
            <time className="text-xs text-muted-foreground" dateTime={record.date}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(record.date + "T00:00:00Z"))}</time>
            <ul className="list-disc space-y-2 pl-5 text-sm">{record.notes[locale].map((note, index) => <li key={index}>{note}</li>)}</ul>
            {record.skill ? <div className="space-y-2 text-sm"><h4 className="font-medium">{t("Skill updates")}</h4><ul className="list-disc space-y-2 pl-5">{record.skill.notes[locale].map((note, index) => <li key={index}>{note}</li>)}</ul>
              {record.skill.compatibility === "unknown" ? <p className="text-muted-foreground">{t("Ask your AI tool to review compatibility before changing your skill or documents.")}</p> : null}</div> : null}
            {availableReleaseHref(release, reading.release, record) ? <a href={availableReleaseHref(release, reading.release, record)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Read release details (opens in a new tab)")}</a> : null}
          </section>) : <ul className="list-disc space-y-2 pl-5 text-sm">{reading?.release.notes[locale].map((note, index) => <li key={index}>{note}</li>)}</ul>}
          {changed ? <p role="status" className="text-sm text-muted-foreground">{t("The prepared update changed. Review its notes again before applying.")}</p> : null}
          {reading?.pending && !changed ? <section className="space-y-3 border-t border-border pt-4" aria-busy={!prepared || prepared.state === "checking"}>
            <h3 className="text-sm font-semibold">{t("Skill updates")}</h3>
            {!prepared || prepared.state === "checking" ? <p className="text-sm text-muted-foreground">{t("Checking the registered skill for this update…")}</p> : null}
            {prepared?.state === "none" ? <p className="text-sm text-muted-foreground">{t("No skill folder is registered. Only the app will be updated.")}</p> : null}
            {prepared?.state === "current" ? <p className="text-sm text-muted-foreground">{t("Your registered skill already matches this update. Its files will stay unchanged.")}</p> : null}
            {prepared?.state === "update" && prepared.review ? <>
              <p className="break-all text-sm">{t("Registered folder")}: <strong>{prepared.review.connection.name}</strong></p>
              <SkillComparisonSummary review={prepared.review} channel={reading.release.channel} />
              <SkillChanges review={prepared.review} />
              <p className="text-sm text-muted-foreground">{t("After the app reloads, your skill will be backed up in this browser and updated. Keep the window open until it finishes. You can restore the backup in Skill updates.")}</p>
            </> : null}
            {prepared?.state === "blocked" ? <>
              <p role="status" className="text-sm">{t(prepared.error!, { defaultValue: t("Skill operation failed. Review the backup before trying again.") })}</p>
              <p className="text-sm text-muted-foreground">{t("You can update only the app and manage your skill separately.")}</p>
              <Button size="sm" variant="outline" disabled={confirming} onClick={() => { resumeReading.current = reading; close(); }}>{t("Skill updates")}</Button>
            </> : null}
          </section> : null}
          {!reading?.pending && reading?.records.some((record) => record.skill) ? <Button size="sm" variant="outline" onClick={() => { resumeReading.current = reading; close(); }}>{t("Skill updates")}</Button> : null}
        </DialogBody>
        <DialogFooter className="flex-col items-stretch">
          <div className="flex flex-wrap gap-2">
            <a href="/releases" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("All releases (opens in a new tab)")}</a>
            <a href="/docs/updates" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("Read documentation (opens in a new tab)")}</a>
          </div>
          {reading?.pending && !changed && prepared?.state === "update" ? <SkillReplacementNotice /> : null}
          {!confirming && app.status === "blocked" ? <p role="status" className="text-sm">{t("Save or discard unfinished changes in other app windows too, and wait for saves to finish. Close any unresponsive windows, then try again.")}</p> : null}
          {applyError ? <p role="alert" className="text-sm text-destructive">{t(applyError, { defaultValue: t("Skill operation failed. Review the backup before trying again.") })}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={confirming} onClick={close}>{t(reading?.pending ? "Later" : "Close")}</Button>
          {reading?.pending ? changed ? <Button disabled={!waiting || confirming} onClick={() => { setApplyError(""); if (waiting) setReading({ release: waiting, records: releaseRecords(waiting).slice().reverse(), pending: true, automatic: false }); }}><RefreshCw />{t("View update")}</Button> : <Button disabled={confirming || app.status === "applying" || !prepared || prepared.state === "checking"} onClick={() => void apply()}><RefreshCw />{t(prepared?.state === "update" ? "Back up skill and update both" : prepared?.state === "blocked" ? "Update app only" : "Apply update")}</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SkillUpdates open={skillOpen} onOpenChange={(open) => {
      setSkillOpen(open);
      if (!open) { const previous = resumeReading.current; resumeReading.current = null; setReading(previous); }
    }} />
  </>;
}
