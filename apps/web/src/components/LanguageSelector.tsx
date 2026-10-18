import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { setLanguage, useTranslation } from "../i18n";

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  return (
    <Select value={i18n.language} onValueChange={(value) => { if (value === "ko" || value === "en") void setLanguage(value); }}>
      <SelectTrigger aria-label={t("Language")} className="w-auto shrink-0 gap-2">
        <Languages className="size-4" aria-hidden="true" /><SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="ko">한국어</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );
}
