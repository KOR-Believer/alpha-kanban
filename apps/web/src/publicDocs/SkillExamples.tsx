import { useState } from "react";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { useTranslation } from "../i18n";
import { SkillFolderConnection } from "../skills/SkillFolderConnection";
import { SkillReinstallReview } from "../skills/SkillReinstallReview";
import { SkillBackupList, SkillUpdateReview, serializeSkillBackup } from "../skills/SkillReviewPanels";
import type { SkillReview, SkillRecovery } from "../skills/repository";

// Display-only metadata. No handle in this example can access a directory.
const folder = { name: "implementation-ledger", kind: "directory" } as FileSystemDirectoryHandle;
const connection = { id: "public-example", name: folder.name, handle: folder };
const path = "references/example.md";
const before = { path, content: "# Example\n\nReview before replacing files.\n", sha256: "b04a73d506c7a221ea0eefd47587b65b3d14dbbe2c1fc498837b39c518f848b8", mtime: 0 };
const after = { path, content: "# Example\n\nReview and back up before replacing files.\n", sha256: "2cb2a379c4d7608b03fbaa5419ab354bf71ac42239bd1f6adbc87d0a92aa14c8" };
const bundle: SkillReview["bundle"] = {
  schema: 1, name: "implementation-ledger", version: "8416d94a20f8", files: [after],
  known: [{ source: "b03472aea529", files: [before] }],
};
const initialBackup: SkillRecovery = { id: "example", connection, before: [before], intended: [after], createdAt: "2026-11-03T09:00:00Z", state: "applied", operation: "update" };

export function BackupExample({ initial = initialBackup, onRestored }: { initial?: SkillRecovery; onRestored?: () => void }) {
  const { t } = useTranslation();
  const [record, setRecord] = useState(initial);
  const [confirm, setConfirm] = useState<string>();
  const [exported, setExported] = useState("");
  const [changed, setChanged] = useState(false);
  return <>
    {!onRestored && record.state !== "restored" && <label className="ak-docs-example-check"><Checkbox checked={changed} onCheckedChange={v => setChanged(v === true)} />{t("Simulate an external file change")}</label>}
    {record.state === "pending" && <p role="alert">{t("The skill changed outside this app. Compare it again before updating.")}</p>}
    {record.state === "restored" && <p role="status">{t("Original skill files restored and verified.")}</p>}
    <SkillBackupList backups={[record]} busy={false} pending={record.state === "pending"} restoreId={confirm}
      onStart={setConfirm} onCancel={() => setConfirm(undefined)}
      exportBackup={item => setExported(serializeSkillBackup(item))}
      onRestore={() => { setRecord({ ...record, state: changed ? "pending" : "restored" }); setConfirm(undefined); if (!changed) onRestored?.(); }} />
    {exported && <pre className="overflow-x-auto">{exported}</pre>}
  </>;
}

export function SkillUpdateExample() {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false), [candidate, setCandidate] = useState(false);
  const [scenario, setScenario] = useState<"update" | "custom" | "review">("update");
  const [confirmed, setConfirmed] = useState(false), [reinstall, setReinstall] = useState(false);
  const [backup, setBackup] = useState<SkillRecovery>();
  const [applied, setApplied] = useState(false);
  const state = applied ? "current" : scenario;
  const files = applied ? [{ ...after, mtime: 0 }] : scenario === "custom" ? [{ ...before, content: "# My notes\n", sha256: "930504fb642beb321376682f5d7b76e06d91cb7ac4d309b5004b6ab8a4d12850" }] : [before];
  const review: SkillReview = { connection, state, files, bundle, changes: applied ? [] : [{ path, kind: "change" }] };
  function clearConsent() { setReinstall(false); setConfirmed(false); }
  function apply() {
    setBackup({ ...initialBackup, before: files, operation: reinstall ? "reinstall" : "update" });
    setApplied(true); clearConsent();
  }
  return <>
    <div onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setCandidate(true);
        clearConsent();
      }}>
      <SkillFolderConnection connection={connected ? connection : undefined} candidate={candidate ? folder : undefined}
        needsAccess={false} busy={false} recovery={false} dropSupported onChoose={() => { setConnected(true); setCandidate(false); clearConsent(); }}
        onAllow={() => { setConnected(true); setCandidate(false); }} onCancel={() => setCandidate(false)}
        onCheck={clearConsent} onDisconnect={() => { setConnected(false); clearConsent(); }} />
    </div>
    {!candidate && !connected && <Button size="sm" variant="outline" onClick={() => setCandidate(true)}>{t("Show the state after dropping a folder")}</Button>}
    {connected && !candidate && <>
      <fieldset><legend className="mb-2 text-xs font-semibold text-muted-foreground">{t("Example scenario")}</legend><div className="ak-docs-example-options">{([["update", "Compatible update example"], ["custom", "Unrecognized installation"], ["review", "Compatibility needs review"]] as const).map(([value, label]) =>
        <Button key={value} size="sm" variant={scenario === value ? "secondary" : "outline"} aria-pressed={scenario === value} onClick={() => {
          setScenario(value); setApplied(false); setBackup(undefined); clearConsent();
        }}>{t(label)}</Button>)}</div></fieldset>
      {applied && <p role="status">{t("Skill files saved and verified. Check that your AI tool recognizes the updated skill.")}</p>}
      {reinstall ? <SkillReinstallReview review={review} busy={false} confirmed={confirmed} onConfirmedChange={setConfirmed} onApply={apply} onCancel={clearConsent} />
        : <SkillUpdateReview review={review} busy={false} pending={false} confirmed={confirmed} setConfirmed={setConfirmed} onApply={apply} onReinstall={() => { setReinstall(true); setConfirmed(false); }} />}
    </>}
    {backup && <BackupExample key={backup.createdAt + ":" + Number(applied)} initial={backup} onRestored={() => { setApplied(false); setBackup({ ...backup, state: "restored" }); clearConsent(); }} />}
  </>;
}
