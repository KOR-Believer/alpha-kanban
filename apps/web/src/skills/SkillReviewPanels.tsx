import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { useTranslation } from "../i18n";
import { SkillComparisonSummary } from "./SkillComparisonSummary";
import { SkillReplacementNotice } from "./SkillReplacementNotice";
import { SkillChanges } from "./SkillChanges";
import { formatSkillBytes, skillBackupContentBytes } from "./backupSize";
import type { SkillReview, SkillRecovery } from "./repository";

export function SkillUpdateReview({ review, busy, pending, confirmed, setConfirmed, onApply, onReinstall }: {
  review: SkillReview; busy: boolean; pending: boolean; confirmed: boolean; setConfirmed: (value: boolean) => void;
  onApply: () => void; onReinstall: () => void;
}) {
  const { t } = useTranslation();
  return <section className="space-y-3">
    <div data-tour="skill-comparison"><SkillComparisonSummary review={review} /></div>
    <h3 className="text-sm font-semibold">{t(review.state === "current" ? "Matches this app's skill bundle" : review.state === "update" ? "An update is available for this installation" : review.state === "review" ? "Ask your AI tool to review compatibility before changing your skill or documents." : "This installation differs from known official bundles. Regular updates will not replace it.")}</h3>
    {review.changes.length ? <SkillChanges review={review} /> : null}
    {review.state === "update" ? <>
      <p className="text-sm text-muted-foreground">{t("A full backup stays in this browser, outside the skill folder. Keep this window open until verification finishes. Multiple files cannot be replaced atomically.")}</p>
      <SkillReplacementNotice />
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><span>{t("I have finished tasks using this skill in my AI tools and reviewed the files to replace.")}</span></label>
      <Button data-tour="skill-apply" disabled={!confirmed || busy} onClick={onApply}><RefreshCw />{t("Back up and update skill")}</Button>
    </> : null}
    {review.state === "custom" && !pending ? <Button data-tour="skill-reinstall" variant="outline" disabled={busy} onClick={onReinstall}><RotateCcw />{t("Review reinstall")}</Button> : null}
  </section>;
}
export function serializeSkillBackup({ createdAt, state, operation, before, intended }: SkillRecovery) {
  return JSON.stringify({ schema: 1, skill: "implementation-ledger", createdAt, state, operation, before, intended }, null, 2);
}

export function SkillBackupList({ backups, busy, pending, restoreId, onStart, exportBackup, onRestore, onCancel }: {
  backups: SkillRecovery[]; busy: boolean; pending: boolean; restoreId?: string; onStart: (id: string) => void;
  exportBackup: (record: SkillRecovery) => void; onRestore: (record: SkillRecovery) => void; onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  return <section className="space-y-3">
    <h3 data-tour="skill-backups" className="text-sm font-semibold">{t("Skill backups")}</h3>
    <p className="text-xs text-muted-foreground">{t("Total backup file contents: {{size}}.", { size: formatSkillBytes(backups.reduce((total, record) => total + skillBackupContentBytes(record), 0), i18n.language) })}</p>
    <p className="text-xs text-muted-foreground">{t("Backups stay on this site in this browser and are not automatically deleted, even after restoring or disconnecting.")}</p>
    <p className="text-xs text-muted-foreground">{t("Disconnecting keeps these backups. Export a copy before clearing browser data. Restore will stop if files have changed outside this app.")}</p>
    <ul className="divide-y divide-border">{backups.map((record) => <li key={record.id} className="space-y-2 py-3">
      <p className="text-sm">{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.createdAt))} · {t(record.state === "pending" ? "Recovery required" : record.state === "restored" ? "Restored" : "Update verified")}</p>
      <p className="text-xs text-muted-foreground">{t("Backup file contents: {{size}} (before and after).", { size: formatSkillBytes(skillBackupContentBytes(record), i18n.language) })}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => exportBackup(record)}><Download />{t("Export backup")}</Button>
        {record.state !== "restored" ? <Button size="sm" variant="outline" disabled={busy || (pending && record.state !== "pending")} onClick={() => onStart(record.id)}><RotateCcw />{t("Restore backup")}</Button> : null}</div>
      {restoreId === record.id ? <div data-tour="skill-restore" className="space-y-2">
        <p className="text-sm">{t("Finish AI tasks using this skill before restoring. Only files matching the recorded copies will be replaced.")}</p>
        <SkillReplacementNotice />
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => onRestore(record)}><RotateCcw />{t("Confirm restore")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button></div>
      </div> : null}
    </li>)}</ul>
  </section>;
}
