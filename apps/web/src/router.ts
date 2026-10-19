import { createRootRoute, createRoute, createRouter, type RouterHistory } from "@tanstack/react-router";
import { AppRoot } from "./AppRoot";

export function createAppRouter(history?: RouterHistory) {
  const rootRoute = createRootRoute({ component: AppRoot });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/w/$workspaceId" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/all" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/intro" }),
  ];
  return createRouter({ routeTree: rootRoute.addChildren(routes), history });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
