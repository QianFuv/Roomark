/**
 * Admin index: go to rooms.
 *
 * @module
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/rooms", replace: true });
  },
});
