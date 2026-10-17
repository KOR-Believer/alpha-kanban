import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { App } from "./App";
import { AllProjectsBoard } from "./AllProjectsBoard";
import { IntroPage } from "./IntroPage";
import { IS_BROWSER_LOCAL } from "./storageMode";
import { browserRepository } from "./browser/repository";

export function AppRoot() {
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [allowStartupAutoOpen, setAllowStartupAutoOpen] = useState(pathname === "/");
  useEffect(() => {
    if (pathname !== "/") setAllowStartupAutoOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!IS_BROWSER_LOCAL || pathname === "/intro") return;
    return browserRepository.subscribe(() => {
      for (const key of ["workspaces", "browser-connections", "browser-recoveries", "board-order", "document-sets"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    });
  }, [pathname, queryClient]);
  // Do not mount App on /intro: its startup queries and automatic reopening belong to the launcher.
  if (pathname === "/intro") return <IntroPage />;
  return pathname === "/all" ? <AllProjectsBoard /> : <App allowStartupAutoOpen={allowStartupAutoOpen} />;
}
