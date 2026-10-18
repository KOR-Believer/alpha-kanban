import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { english, korean } from "./messages";

export { useTranslation } from "react-i18next";
export type Language = "ko" | "en";
export const LANGUAGE_STORAGE_KEY = "alpha-kanban.locale";

export function readLanguage(): Language {
  try { return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "ko"; }
  catch { return "ko"; }
}

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: readLanguage(), fallbackLng: "ko", supportedLngs: ["ko", "en"],
  resources: { ko: { translation: korean }, en: { translation: english } },
  keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false },
  initAsync: false,
});

function syncDocumentLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}
syncDocumentLanguage(i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);

export function setLanguage(language: Language) {
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Session-only preference. */ }
  return i18n.changeLanguage(language);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) void i18n.changeLanguage(readLanguage());
  });
}

// Non-component formatting helpers use this; components subscribe via useTranslation.
export const t = i18n.t.bind(i18n);
export const locale = () => i18n.language === "en" ? "en-US" : "ko-KR";
