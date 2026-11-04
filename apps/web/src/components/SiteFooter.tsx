import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "../i18n";
import { GitHubIcon } from "./GitHubIcon";

export function SiteFooter({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return <footer className={`ak-site-footer ${className}`}>
    <span>Alpha Kanban / implementation-ledger</span>
    <a href="https://github.com/KOR-Believer/alpha-kanban" target="_blank" rel="noopener noreferrer" className="ak-focus-ring" aria-label={t("Open Alpha Kanban on GitHub (opens in a new tab)")}>
      <GitHubIcon />{t("GitHub")}<ArrowUpRight aria-hidden="true" />
    </a>
  </footer>;
}
