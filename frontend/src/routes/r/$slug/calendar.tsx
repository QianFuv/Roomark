/**
 * Room calendar route.
 *
 * @module
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { RoomCalendar } from "../../../features/room/room-calendar";

const searchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
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
  const { date, time } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <RoomCalendar
      slug={slug}
      anchorDate={date}
      focusClock={time}
      onAnchorChange={(next) =>
        void navigate({
          to: "/r/$slug/calendar",
          params: { slug },
          search: next === undefined ? {} : { date: next },
          replace: true,
        })
      }
    />
  );
}
