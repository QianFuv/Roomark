/**
 * Room home route.
 *
 * @module
 */
import { createFileRoute } from "@tanstack/react-router";

import { RoomHome } from "../../../features/room/room-home";

export const Route = createFileRoute("/r/$slug/")({ component: RoomHomePage });

/**
 * Room home page.
 *
 * @returns The page.
 */
function RoomHomePage() {
  const { slug } = Route.useParams();
  const { quick } = Route.useSearch();

  return <RoomHome slug={slug} isQuickRequested={quick === true} />;
}
