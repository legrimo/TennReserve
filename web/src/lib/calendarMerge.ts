import type { Booking, CalendarSnapshot, GridCellStatus } from "@/lib/api";

/** Overlay confirmed bookings onto the calendar (mirrors backend mergeOwnedBookings). */
export function mergeOwnedBookings(calendar: CalendarSnapshot, bookings: Booking[]): CalendarSnapshot {
  if (bookings.length === 0) return calendar;
  const byKey = new Map(
    bookings.map((b) => [`${b.date}-${b.time24}-${b.court}`, b])
  );
  return {
    ...calendar,
    days: calendar.days.map((day) => ({
      ...day,
      cells: day.cells.map((cell) => {
        const hit = byKey.get(`${cell.date}-${cell.time24}-${cell.court}`);
        if (!hit) return cell;
        return {
          ...cell,
          status: "booked" as GridCellStatus,
          slotId: hit.slotId,
          owned: true,
          reservationNumber: hit.reservationNumber,
        };
      }),
    })),
  };
}
