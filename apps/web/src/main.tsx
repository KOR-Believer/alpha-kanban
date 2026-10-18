import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRoute,
  createRootRoute,
  createRouter,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AllProjectsBoard } from "./AllProjectsBoard";
import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient();

const ALL_TICKETS_PATH = "/all";

// App stays mounted across "/" and "/w/$workspaceId"; only the all-tickets board swaps it out.
function Root() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pathname === ALL_TICKETS_PATH ? <AllProjectsBoard /> : <App />;
}

const rootRoute = createRootRoute({
  component: Root,
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

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, workspaceRoute, allTicketsRoute]),
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

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
