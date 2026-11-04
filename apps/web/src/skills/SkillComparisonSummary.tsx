import { useTranslation } from "../i18n";
import type { ReleaseInfo } from "../pwa/releases";
import type { SkillReview } from "./repository";
import { identifySkillInstallation } from "./installation";
import { skillChannelLabel } from "./distribution";

export function SkillComparisonSummary({ review, channel = __APP_RELEASE__.channel }: {
  review: SkillReview;
  channel?: ReleaseInfo["channel"];
}) {
  const { t } = useTranslation();
  const installed = identifySkillInstallation(review.files, review.bundle);
  return <dl className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2" aria-label={t("Skill comparison")}>
    <div className="min-w-0 space-y-1" data-skill-comparison="installed">
      <dt className="text-sm font-semibold">{t("Installed skill")}</dt>
      <dd className="break-all text-sm">{review.connection.name}</dd>
      <dd className="text-xs text-muted-foreground">
        {t(installed.kind === "current" ? "Matches the provided bundle" : installed.kind === "known" ? "Recognized release" : "Unrecognized installation")}
      </dd>
      {installed.kind !== "unknown" ? <dd className="text-xs text-muted-foreground">
        {t(installed.kind === "current" ? "Bundle ID" : "Source commit")}{": "}
        <code title={installed.kind === "known" ? installed.source : undefined}>{installed.kind === "current" ? installed.bundle : installed.source.slice(0, 12)}</code>
      </dd> : null}
    </div>
    <div className="min-w-0 space-y-1" data-skill-comparison="target">
      <dt className="text-sm font-semibold">{t("Skill to apply")}</dt>
      <dd className="text-sm">{t(skillChannelLabel(channel))}</dd>
      <dd className="text-xs text-muted-foreground">{t("Bundle ID")}{": "}<code>{review.bundle.version}</code></dd>
    </div>
  </dl>;
}
