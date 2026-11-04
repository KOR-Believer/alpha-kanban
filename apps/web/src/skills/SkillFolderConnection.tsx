import { useRef, useState } from "react";
import { Copy, FolderOpen, RefreshCw, Unplug } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import type { SkillConnection } from "./repository";

export const FIND_SKILL_REQUEST = "Find the implementation-ledger installation used by this AI environment. Report its actual folder path as copyable text and, if possible, open its containing folder in the file manager with implementation-ledger selected. Do not install, move, edit or replace any files.";

export function SkillFolderConnection({ connection, candidate, needsAccess, busy, recovery, dropSupported, onChoose, onAllow, onCancel, onCheck, onDisconnect }: {
  connection?: SkillConnection;
  candidate?: FileSystemDirectoryHandle;
  needsAccess: boolean;
  busy: boolean;
  recovery: boolean;
  dropSupported: boolean;
  onChoose: () => void;
  onAllow: () => void;
  onCancel: () => void;
  onCheck: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const disabled = busy || recovery;
  return <>
    <section data-skill-folder-drop="" aria-label={t("Skill folder connection")}
      className={`grid gap-3 rounded-[var(--ak-radius-md)] border bg-muted/30 p-4 ${dragging && !disabled ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { depth.current++; setDragging(true); } }}
      onDragLeave={() => { if (--depth.current <= 0) { depth.current = 0; setDragging(false); } }}
      onDrop={() => { depth.current = 0; setDragging(false); }}>
      {candidate ? <>
        <h3 className="text-sm font-semibold">{t("Connect this folder?")}</h3>
        <p className="flex min-w-0 items-center gap-2 text-sm"><FolderOpen className="size-4 shrink-0" /><strong className="break-all">{candidate.name}</strong></p>
        <p className="text-sm text-muted-foreground">{t("Allow read and write access to check this installation and apply updates you approve separately.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled} onClick={onAllow}>{t("Allow access and connect")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t("Cancel selection")}</Button>
        </div>
        {connection ? <p className="break-all text-xs text-muted-foreground">{t("Current connection: {{name}}", { name: connection.name })}</p> : null}
      </> : connection ? <>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t("Registered folder")}</h3><Badge variant={needsAccess ? "warning" : "muted"}>{t(needsAccess ? "Access needed" : "Connected")}</Badge></div>
        <p className="flex min-w-0 items-center gap-2 text-sm"><FolderOpen className="size-4 shrink-0" /><strong className="break-all">{connection.name}</strong></p>
        {needsAccess ? <p className="text-sm text-muted-foreground">{t("Your connection is saved. Allow access again to check the installed files.")}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled} onClick={onCheck}><RefreshCw />{t(needsAccess ? "Allow access again" : "Check installed skill")}</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={onChoose}><FolderOpen />{t("Choose another skill folder")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDisconnect}><Unplug />{t("Disconnect")}</Button>
        </div>
        {dropSupported ? <p className="text-xs text-muted-foreground">{t("You can also drop another implementation-ledger folder here.")}</p> : null}
      </> : <>
        <FolderOpen className="size-5 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{t(dropSupported ? "Drop your installed folder here" : "Connect your installed folder")}</h3>
        <p className="text-sm text-muted-foreground">{t("Connect one implementation-ledger folder, not its parent skills folder or the SKILL.md file.")}</p>
        <Button className="justify-self-start" size="sm" disabled={disabled} onClick={onChoose}><FolderOpen />{t("Choose folder")}</Button>
        {!dropSupported ? <p className="text-xs text-muted-foreground">{t("Folder drop is unavailable here. Use Choose folder instead.")}</p> : null}
      </>}
      <p className="text-xs text-muted-foreground">{t("Connecting does not change files. Each update needs a separate confirmation.")}</p>
    </section>
    {!connection && !candidate ? <p className="text-sm text-muted-foreground">{t("Install with your AI tool first, then connect the installed folder here.")}</p> : null}
    <FolderLocationHelp />
  </>;
}

function FolderLocationHelp() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  return <details className="border-b border-border pb-4 text-sm">
    <summary className="ak-focus-ring cursor-pointer font-medium">{t("Can't find the installed folder?")}</summary>
    <div className="mt-3 grid gap-3">
      <p className="text-muted-foreground">{t("Ask your AI tool for the actual installation path. Connect that folder itself.")}</p>
      <Textarea ref={input} readOnly value={t(FIND_SKILL_REQUEST)} rows={4} aria-label={t("Request to locate the installed skill")} />
      <Button size="sm" variant="outline" className="justify-self-start" onClick={async () => {
        try { await navigator.clipboard.writeText(t(FIND_SKILL_REQUEST)); setNotice(true); }
        catch { input.current?.focus(); input.current?.select(); }
      }}><Copy />{t("Copy request")}</Button>
      {notice ? <p role="status">{t("Copied. Paste this request into your AI tool.")}</p> : null}
      <dl className="grid gap-2 text-xs text-muted-foreground">
        <div><dt className="font-semibold text-foreground">{t("macOS")}</dt><dd>{t("In the folder picker, press Command+Shift+G, paste the folder path and press Return. Select the implementation-ledger folder.")}</dd></div>
        <div><dt className="font-semibold text-foreground">{t("Windows")}</dt><dd>{t("In the folder picker, press Ctrl+L, paste the folder path and press Enter. Select the implementation-ledger folder.")}</dd></div>
      </dl>
    </div>
  </details>;
}
