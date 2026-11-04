import { FlaskConical, FolderKanban, type LucideProps } from "lucide-react";
import { appBrand } from "../brand";
import { useTranslation } from "../i18n";
import { Badge } from "./ui/badge";

export function BrandIcon(props: LucideProps) {
  const Icon = appBrand.icon === "flask" ? FlaskConical : FolderKanban;
  return <Icon aria-hidden="true" {...props} />;
}

/** Omit entirely on stable; it must not reserve space or change that layout. */
export function ChannelBadge({ icon = true }: { icon?: boolean }) {
  const { t } = useTranslation();
  if (appBrand.channel !== "canary") return null;
  return <Badge className="ak-channel-badge" aria-label={t("Alpha Kanban Canary")} title={t("Alpha Kanban Canary")}>
    {icon ? <BrandIcon /> : null}<span>{t("CANARY")}</span>
  </Badge>;
}

export function AppBrand() {
  const { t } = useTranslation();
  return <><BrandIcon /><span className="ak-brand-name">{t("Alpha Kanban")}</span><ChannelBadge icon={false} /></>;
}
