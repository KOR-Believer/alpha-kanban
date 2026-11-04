import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { App } from "./App";
import { AllProjectsBoard } from "./AllProjectsBoard";
import { IntroPage } from "./IntroPage";
import { browserRepository } from "./browser/repository";
import { ReleaseCenter } from "./pwa/ReleaseCenter";
import { LinkedNavigationProvider } from "./browser/linkedNavigation";

export function AppRoot() {
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [allowStartupAutoOpen, setAllowStartupAutoOpen] = useState(pathname === "/");
  useEffect(() => {
    if (pathname !== "/") setAllowStartupAutoOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (pathname === "/intro") return;
    return browserRepository.subscribe(() => {
      for (const key of ["workspaces", "browser-connections", "browser-recoveries", "board-order", "document-sets", "document-count"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    });
  }, [pathname, queryClient]);
  // Do not mount App on /intro: its startup queries and automatic reopening belong to the launcher.
  return <LinkedNavigationProvider>
    {pathname === "/intro" ? <IntroPage /> : pathname === "/all" ? <AllProjectsBoard /> : <App allowStartupAutoOpen={allowStartupAutoOpen} />}
    <ReleaseCenter />
  </LinkedNavigationProvider>;
}
