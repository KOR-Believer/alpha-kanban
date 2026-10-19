import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createAppRouter } from "./router";
import "./styles.css";
import { appInstaller } from "./pwa/install";
import { pwaClient } from "./pwa/client";
import { startPwaSession } from "./pwa/session";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: "always", retry: false, refetchOnWindowFocus: false },
    mutations: { networkMode: "always", retry: false },
  },
});

const router = createAppRouter();

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
