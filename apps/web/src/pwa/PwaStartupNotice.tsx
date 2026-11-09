import { AppBrand } from "../components/AppBrand";
import { Button, buttonVariants } from "../components/ui/button";
import { useTranslation } from "../i18n";

/** No router, workspace queries or skill operations mount until versions agree. */
export function PwaStartupNotice() {
  const { t } = useTranslation();
  return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6" aria-labelledby="pwa-startup-title">
    <div className="ak-channel-title text-sm"><AppBrand /></div>
    <h1 id="pwa-startup-title" className="text-xl font-semibold">{t("Check for an app update")}</h1>
    <p className="text-sm leading-relaxed text-muted-foreground">{t("This page and your saved app use different versions. Open Kanban, check for an app update, then reopen this page.")}</p>
    <div className="flex flex-wrap gap-2">
      <a href="/" className={buttonVariants()}>{t("Open Kanban")}</a>
      <Button variant="outline" onClick={() => location.reload()}>{t("Reopen this page")}</Button>
    </div>
  </main>;
}
