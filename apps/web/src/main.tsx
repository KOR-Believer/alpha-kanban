import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRoute,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppRoot } from "./AppRoot";
import "./styles.css";
import { IS_BROWSER_LOCAL } from "./storageMode";
import { appInstaller } from "./pwa/install";
import { pwaClient } from "./pwa/client";
import { startPwaSession } from "./pwa/session";

const queryClient = new QueryClient(IS_BROWSER_LOCAL ? {
  defaultOptions: {
    queries: { networkMode: "always", retry: false, refetchOnWindowFocus: false },
    mutations: { networkMode: "always", retry: false },
  },
} : undefined);

const ALL_TICKETS_PATH = "/all";

const rootRoute = createRootRoute({
  component: AppRoot,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/w/$workspaceId",
});

const allTicketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ALL_TICKETS_PATH,
});

const introRoute = createRoute({ getParentRoute: () => rootRoute, path: "/intro" });

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, workspaceRoute, allTicketsRoute, introRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

async function mount() {
  if (__PWA_ENABLED__ && "serviceWorker" in navigator && navigator.locks) {
    appInstaller.start();
    try {
      if (!await startPwaSession()) return;
      void pwaClient.start();
    } catch {
      // Fail closed before mounting anything that can write local files.
      location.replace("/repair.html");
      return;
    }
  }
  createRoot(rootElement!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
void mount();
