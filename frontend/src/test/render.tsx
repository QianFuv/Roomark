/**
 * Component test helpers: render inside the app providers.
 *
 * @module
 */
import { QueryClientProvider } from "@tanstack/react-query";
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
