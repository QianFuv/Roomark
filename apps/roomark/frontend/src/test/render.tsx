/**
 * Component test helpers: render inside the app providers.
 *
 * @module
 */
import { QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";

import { queryClient } from "../api/client";
import { DialogHost } from "../ui/dialogs";
import { ToastHost } from "../ui/toast";

/**
 * Render a component with the query client, toasts and dialogs.
 *
 * @param node - Component tree.
 * @returns The render result.
 */
export function renderWithProviders(node: ReactNode) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastHost>
        {node}
        <DialogHost />
      </ToastHost>
    </QueryClientProvider>,
  );
}

/**
 * Render a component as the page of a catch-all route, so hooks such as `useNavigate` and
 * `<Link>` work. Every path renders the same node.
 *
 * @param node - Component tree.
 * @returns The render result.
 */
export function renderWithRouter(node: ReactNode) {
  const rootRoute = createRootRoute();
  const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: "$", component: () => node });

  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return renderWithProviders(<RouterProvider router={router} />);
}
