/**
 * Room calendar route.
 *
 * @module
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RoomCalendar } from "../../../features/room/room-calendar";

const searchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const Route = createFileRoute("/r/$slug/calendar")({
  validateSearch: searchSchema,
  component: CalendarPage,
});

/**
 * Calendar page.
 *
 * @returns The page.
 */
function CalendarPage() {
  const { slug } = Route.useParams();
  const { date } = Route.useSearch();

  return <RoomCalendar slug={slug} anchorDate={date} />;
}
