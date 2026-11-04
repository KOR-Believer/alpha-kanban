import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { App } from "./App";
import { AllProjectsBoard } from "./AllProjectsBoard";
import { IntroPage } from "./IntroPage";
import { browserRepository } from "./browser/repository";
import { ReleaseCenter } from "./pwa/ReleaseCenter";
import { LinkedNavigationProvider } from "./browser/linkedNavigation";
import { useTranslation } from "./i18n";

const PublicReadingPage = lazy(() => import("./publicDocs/PublicReadingPage").then(module => ({ default: module.PublicReadingPage })));

export function AppRoot() {
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { t } = useTranslation();
  const isIntroduction = pathname === "/about" || pathname === "/intro";
  const isPublicReading = pathname === "/docs" || pathname.startsWith("/docs/") || pathname === "/releases" || pathname.startsWith("/releases/");
  const [allowStartupAutoOpen, setAllowStartupAutoOpen] = useState(pathname === "/");
  useEffect(() => {
    if (pathname !== "/") setAllowStartupAutoOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (isIntroduction || isPublicReading) return;
    return browserRepository.subscribe(() => {
      for (const key of ["workspaces", "browser-connections", "browser-recoveries", "board-order", "document-sets", "document-count"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    });
  }, [isIntroduction, isPublicReading, queryClient]);
  // Public reading must not mount workspace discovery, permission flows or auto-reopening.
  if (isPublicReading) return <Suspense fallback={<p role="status" className="p-6">{t("Loading page…")}</p>}><PublicReadingPage /></Suspense>;
  // Introduction and its legacy redirect never start workspace discovery or reopening.
  return <LinkedNavigationProvider>
    {isIntroduction ? <IntroPage /> : pathname === "/all" ? <AllProjectsBoard /> : <App allowStartupAutoOpen={allowStartupAutoOpen} />}
    <ReleaseCenter />
  </LinkedNavigationProvider>;
}
