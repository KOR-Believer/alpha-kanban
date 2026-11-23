import { Link2 } from "lucide-react";
import { Button } from "./ui/button";
import { useTranslation } from "../i18n";

export function ReconnectFolderButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return <Button size="sm" variant="outline" disabled={disabled} onClick={onClick}><Link2 />{t("Reconnect folder")}</Button>;
}
