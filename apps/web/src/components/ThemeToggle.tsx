import { Moon, Sun } from "lucide-react";
import { useTranslation } from "../i18n";
import { setTheme, useTheme } from "../theme";
import { Button } from "./ui/button";

export function ThemeToggle() {
  const { t } = useTranslation();
  const isDark = useTheme() === "dark";
  const label = isDark ? t("Switch to light mode") : t("Switch to dark mode");
  const Icon = isDark ? Sun : Moon;
  return <Button type="button" size="iconSm" variant="ghost" aria-label={label} title={label}
    onClick={() => setTheme(isDark ? "light" : "dark")}>
    <Icon aria-hidden="true" />
  </Button>;
}
