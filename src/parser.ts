import * as cheerio from "cheerio";
import type { GridCell, GridCellStatus, GridDay, Slot } from "./types.js";

const BASE_URL = "https://www.nycgovparks.org";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** "6:00 a.m." -> "06:00", "12:00 p.m." -> "12:00", "12:00 a.m." -> "00:00" */
export function to24h(label: string): string {
  const m = label
    .toLowerCase()
    .replace(/\s+/g, " ")
    .match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/);
  if (!m) throw new Error(`Unparseable time label: ${JSON.stringify(label)}`);
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const meridiem = m[3];
  if (meridiem === "p" && hour !== 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function weekdayOf(isoDate: string): string {
  // Parse as local date (the site operates in America/New_York, same as this machine)
  const [y, mo, d] = isoDate.split("-").map(Number);
  return WEEKDAYS[new Date(y, mo - 1, d).getDay()];
}

/**
 * Parse the availability page for a facility into bookable slots.
 * Structure (verified against captured HTML for facility 11):
 *   <div id="2026-07-03" class="tab-pane">
 *     <h3>Friday, July 03, 2026</h3>
 *     <table><thead><tr><td/><th>Court 5</th><th>Court 6</th></tr></thead>
 *       <tbody><tr><td><strong>12:00 p.m.</strong></td>
 *         <td class="status2"><a href="/tennisreservation/reserve/699723" class="assign_someone ...">
 */
export function parseAvailability(html: string): Slot[] {
  const $ = cheerio.load(html);
  const slots: Slot[] = [];

  $("div.tab-pane").each((_, pane) => {
    const date = $(pane).attr("id") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const day = weekdayOf(date);

    $(pane)
      .find("table")
      .each((_, table) => {
        const courts: number[] = [];
        $(table)
          .find("thead th")
          .each((_, th) => {
            const m = $(th).text().match(/Court\s+(\d+)/i);
            courts.push(m ? parseInt(m[1], 10) : NaN);
          });

        $(table)
          .find("tbody tr")
          .each((_, tr) => {
            const cells = $(tr).children("td").toArray();
            if (cells.length < 2) return;
            const timeLabel = $(cells[0]).text().trim();
            let time24: string;
            try {
              time24 = to24h(timeLabel);
            } catch {
              return;
            }
            // Remaining cells map 1:1 onto the courts from the header
            cells.slice(1).forEach((cell, i) => {
              const link = $(cell).find("a.assign_someone");
              if (!link.length) return;
              // Ignore in-progress holds ("Continue Booking") — only fresh openings
              const label = link.text().trim();
              if (label !== "Reserve this time") return;
              const href = link.attr("href");
              if (!href) return;
              const m = href.match(/\/tennisreservation\/reserve\/(\d+)/);
              if (!m) return;
              slots.push({
                date,
                day,
                time24,
                court: courts[i],
                slotId: m[1],
                url: `${BASE_URL}${href}`,
              });
            });
          });
      });
  });

  return slots;
}

function cellStatus($: cheerio.CheerioAPI, cell: any): {
  status: GridCellStatus;
  slotId?: string;
  url?: string;
} {
  const $cell = $(cell);
  const link = $cell.find("a.assign_someone");
  if (link.length) {
    const label = link.text().trim();
    const href = link.attr("href") ?? "";
    const m = href.match(/\/tennisreservation\/reserve\/(\d+)/);
    if (m) {
      if (label === "Reserve this time") {
        return { status: "available", slotId: m[1], url: `${BASE_URL}${href}` };
      }
      if (label === "Continue Booking") {
        return { status: "held", slotId: m[1], url: `${BASE_URL}${href}` };
      }
    }
  }
  const text = $cell.text().trim().toLowerCase();
  if (text.includes("booked")) return { status: "booked" };
  return { status: "unavailable" };
}

/** Full day × court × time matrix for the dashboard calendar. */
export function parseAvailabilityGrid(html: string): GridDay[] {
  const $ = cheerio.load(html);
  const days: GridDay[] = [];

  $("div.tab-pane").each((_, pane) => {
    const date = $(pane).attr("id") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const day = weekdayOf(date);
    const cells: GridCell[] = [];

    $(pane)
      .find("table")
      .each((_, table) => {
        const courts: number[] = [];
        $(table)
          .find("thead th")
          .each((_, th) => {
            const m = $(th).text().match(/Court\s+(\d+)/i);
            courts.push(m ? parseInt(m[1], 10) : NaN);
          });

        $(table)
          .find("tbody tr")
          .each((_, tr) => {
            const rowCells = $(tr).children("td").toArray();
            if (rowCells.length < 2) return;
            const timeLabel = $(rowCells[0]).text().trim();
            let time24: string;
            try {
              time24 = to24h(timeLabel);
            } catch {
              return;
            }
            rowCells.slice(1).forEach((cell, i) => {
              const court = courts[i];
              if (!court || Number.isNaN(court)) return;
              const parsed = cellStatus($, cell);
              cells.push({ date, day, court, time24, ...parsed });
            });
          });
      });

    if (cells.length > 0) {
      days.push({ date, day, published: true, cells });
    }
  });

  return days.sort((a, b) => a.date.localeCompare(b.date));
}
