/**
 * Root route: providers and the application shell.
 *
 * @module
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { MapPinOff } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { Suspense, lazy } from "react";

import { queryClient } from "../api/client";
import { AppShell } from "../app/shell";
import { ICON_SIZE, IconDefaults } from "../ui/icon";
import { EmptyState } from "../ui/layout";
import { ToastHost } from "../ui/toast";

const Devtools = import.meta.env.DEV ? lazy(() => import("../app/devtools")) : undefined;

export const Route = createRootRoute({ component: RootLayout, notFoundComponent: NotFound });

/**
 * Root layout with providers.
 *
 * @returns The layout.
 */
function RootLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <IconDefaults>
        <QueryClientProvider client={queryClient}>
          <ToastHost>
            <AppShell>
              <Outlet />
            </AppShell>
          </ToastHost>
          {Devtools === undefined ? null : (
            <Suspense>
              <Devtools />
            </Suspense>
          )}
        </QueryClientProvider>
      </IconDefaults>
    </ThemeProvider>
  );
}

/**
 * Fallback for unknown paths.
 *
 * @returns The not-found page.
 */
function NotFound() {
  return (
    <EmptyState icon={<MapPinOff size={ICON_SIZE.empty} aria-hidden />} title="页面不存在">
      <Link to="/">返回首页</Link>
    </EmptyState>
  );
}
