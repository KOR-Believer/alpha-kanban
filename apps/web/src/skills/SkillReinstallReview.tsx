import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { formatSkillBytes, skillBackupContentBytes } from "./backupSize";
import type { SkillReview } from "./repository";

import { SkillChanges } from "./SkillChanges";

export function SkillReinstallReview({ review, busy, confirmed, onConfirmedChange, onApply, onCancel }: {
  review: SkillReview; busy: boolean; confirmed: boolean; onConfirmedChange: (confirmed: boolean) => void; onApply: () => void; onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  return <section className="space-y-3" aria-label={t("Review skill reinstall")}>
    <h3 className="text-sm font-semibold">{t("Reinstall this app's skill")}</h3>
    <p className="text-sm">{t("Review each changed file below. Reinstalling replaces personal changes and removes files absent from this app's bundle. Your current files will be backed up first.")}</p>
    <p className="text-xs text-muted-foreground">{t("Target bundle")}: <code>{review.bundle.version}</code></p>
    <SkillChanges review={review} />
    <p className="text-xs text-muted-foreground">{t("Backup file contents: {{size}} (before and after).", { size: formatSkillBytes(skillBackupContentBytes({ before: review.files, intended: review.bundle.files }), i18n.language) })}</p>
    <p className="text-xs text-muted-foreground">{t("Backups stay on this site in this browser and are not automatically deleted, even after restoring or disconnecting.")}</p>
    <label className="flex items-start gap-2 text-sm"><Checkbox disabled={busy} checked={confirmed} onCheckedChange={(value) => onConfirmedChange(value === true)} /><span>{t("I have reviewed the changes and agree to replace this installation, including personal changes and extra files.")}</span></label>
    <div className="flex flex-wrap gap-2">
      <Button disabled={!confirmed || busy} onClick={onApply}>{t("Back up and reinstall")}</Button>
      <Button variant="ghost" disabled={busy} onClick={onCancel}>{t("Cancel")}</Button>
    </div>
  </section>;
}
