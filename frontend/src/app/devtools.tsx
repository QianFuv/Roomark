/**
 * TanStack Devtools panel (development builds only).
 *
 * @module
 */
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { useRouter } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

/**
 * Devtools with Query and Router panels.
 *
 * @returns The devtools.
 */
export default function Devtools() {
  const router = useRouter();

  return (
    <TanStackDevtools
      plugins={[
        { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
        { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel router={router} /> },
      ]}
    />
  );
}
