import { useTranslation } from "../i18n";

export function SkillReplacementNotice() {
  const { t } = useTranslation();
  return <div className="space-y-2 text-xs text-muted-foreground">
    <p>{t("Replacing this folder changes the skill for every project that uses it.")}</p>
    <p>{t("Finish AI tasks and skill changes in the other Alpha Kanban app before applying. Keep this window open until verification finishes.")}</p>
  </div>;
}
