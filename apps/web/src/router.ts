import { createRootRoute, createRoute, createRouter, redirect, type RouterHistory } from "@tanstack/react-router";
import { AppRoot } from "./AppRoot";

export function createAppRouter(history?: RouterHistory) {
  const rootRoute = createRootRoute({ component: AppRoot });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/w/$workspaceId" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/all" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/about" }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/intro",
      beforeLoad: ({ location }) => {
        throw redirect({ href: "/about" + location.href.slice(location.pathname.length), replace: true });
      },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: "/docs" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/docs/$" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/releases" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/releases/$" }),
  ];
  return createRouter({ routeTree: rootRoute.addChildren(routes), history });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
