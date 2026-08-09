import type { BookingAttempt, GridDay, SlotPick } from "./types.js";

function pickCellStatus(
  pick: SlotPick,
  gridDays: GridDay[]
): "available" | "booked" | "unavailable" | "held" | "unknown" {
  const day = gridDays.find((d) => d.date === pick.date);
  if (!day?.published) return "unknown";
  const cell = day.cells.find((c) => c.time24 === pick.time24 && c.court === pick.court);
  if (!cell) return "unknown";
  return cell.status;
}

function formatPick(pick: SlotPick): string {
  return `${pick.time24} Court ${pick.court}`;
}

/** True when every target pick is booked or unavailable — no longer winnable. */
export function evaluateAttemptMiss(
  attempt: BookingAttempt,
  gridDays: GridDay[]
): { reason: string } | null {
  if (attempt.slots.length === 0) return null;

  const statuses = attempt.slots.map((pick) => ({
    pick,
    status: pickCellStatus(pick, gridDays),
  }));

  if (statuses.some((s) => s.status === "unknown")) return null;
  if (statuses.some((s) => s.status === "available" || s.status === "held")) return null;

  const parts = statuses.map((s) => `${formatPick(s.pick)}: ${s.status}`);
  return { reason: `Missed drop — ${parts.join("; ")}` };
}
