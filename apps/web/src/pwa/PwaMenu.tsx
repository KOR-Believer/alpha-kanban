import { useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, Download, HardDrive, MonitorDown, RefreshCw, Wrench } from "lucide-react";
import { useTranslation } from "../i18n";
import { ChannelBadge } from "../components/AppBrand";
import { Button, buttonVariants } from "../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { appInstaller } from "./install";
import { pwaClient } from "./client";
import { openReleaseNotes } from "./ReleaseCenter";

const statusKeys = {
  idle: "Using this app version", checking: "Checking for updates", downloading: "Downloading app files",
  ready: "An update is ready", current: "You are up to date", offline: "Updates can be checked when you are online.",
  failed: "Could not prepare the latest app. Your current version is still available. Try again when connected.",
  blocked: "Save or discard unfinished changes in other app windows too, and wait for saves to finish. Close any unresponsive windows, then try again.",
  applying: "Applying update",
  restart: "Close all Alpha Kanban windows and reopen the app to finish this update.",
};

export function PwaMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openNotes = useRef(false);
  const install = useSyncExternalStore(appInstaller.subscribe, appInstaller.getSnapshot);
  const app = useSyncExternalStore(pwaClient.subscribe, pwaClient.getSnapshot);
  if (!__PWA_ENABLED__) return null;
  const waiting = app.status === "ready" || app.status === "blocked";
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button ref={trigger} data-pwa-menu="" size="iconSm" variant="ghost" aria-label={t("App installation and updates")} title={t("App installation and updates")} className="relative">
      <MonitorDown aria-hidden="true" />{waiting ? <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-primary" /> : null}
    </Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] p-4" onCloseAutoFocus={(event) => {
      if (openNotes.current) { event.preventDefault(); openNotes.current = false; requestAnimationFrame(() => openReleaseNotes(trigger.current)); }
    }}>
      <div className="grid gap-3 text-sm">
        <div><div className="ak-channel-title"><h2 className="font-semibold">{t("Alpha Kanban")}</h2><ChannelBadge /></div><p className="mt-1 text-xs text-muted-foreground">{t("Build {{id}}", { id: __APP_RELEASE__.buildId })}</p></div>
        {install.available ? <Button variant="outline" disabled={install.prompting} onClick={() => void appInstaller.install()}><Download aria-hidden="true" />{t("Install app")}</Button> : <p className="text-muted-foreground">{t(install.installed ? "App is installed" : "You can also check installation options in the Chrome menu.")}</p>}
        {install.failed ? <p role="alert">{t("Installation was not completed. Try the Chrome menu.")}</p> : null}
        <div className="border-t border-border pt-3" aria-live="polite">
          <p className="font-medium">{t(app.offlineReady ? "Ready to use offline" : "Offline access is not ready yet")}</p>
          <p className="mt-1 text-muted-foreground">{t(statusKeys[app.status])}</p>
        </div>
        {waiting && app.prepared ? <ul className="list-disc pl-4 text-muted-foreground">{app.prepared.notes[i18n.language === "ko" ? "ko" : "en"].map((note) => <li key={note}>{note}</li>)}</ul> : null}
        <Button variant="outline" onClick={() => { openNotes.current = true; setOpen(false); }}><BookOpen aria-hidden="true" />{t("Update history")}</Button>
        {waiting ? <div className="flex gap-2"><Button onClick={() => { openNotes.current = true; setOpen(false); }}><RefreshCw aria-hidden="true" />{t("Apply update")}</Button><Button variant="ghost" onClick={() => setOpen(false)}>{t("Later")}</Button></div> : null}
        <Button variant="outline" disabled={["checking", "downloading", "applying"].includes(app.status)} onClick={() => void pwaClient.check()}><RefreshCw aria-hidden="true" />{t("Check for updates")}</Button>
        {app.persistent === false ? <Button variant="ghost" onClick={() => void pwaClient.retainStorage()}><HardDrive aria-hidden="true" />{t("Keep app data on this device")}</Button> : null}
        {app.retentionDenied ? <p role="status" className="text-muted-foreground">{t("Chrome did not allow persistent storage. You can continue using the app.")}</p> : null}
        <a href="/repair.html" target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost" })}><Wrench aria-hidden="true" />{t("Repair app")}</a>
      </div>
    </PopoverContent>
  </Popover>;
}
