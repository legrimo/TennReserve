import type { Page } from "playwright";
import { AVAILABILITY_URL } from "./config.js";
import { log } from "./notify.js";
import { parseAvailability } from "./parser.js";
import type { Slot } from "./types.js";

/** NYC Parks allows one in-progress hold per session — cancel others before a fresh reservation. */
export async function cancelOtherHolds(page: Page, keepSlotId: string): Promise<void> {
  const held = page.locator('a.assign_someone', { hasText: "Continue Booking" });
  const count = await held.count();
  for (let i = 0; i < count; i++) {
    const link = held.nth(i);
    const href = (await link.getAttribute("href")) ?? "";
    const id = href.match(/\/reserve\/(\d+)/)?.[1];
    if (!id || id === keepSlotId) continue;

    log(`Cancelling active hold on slot #${id} before reserving #${keepSlotId}`);
    const date = await link.evaluate((el) => el.closest(".tab-pane")?.id ?? "");
    if (date) {
      await page.locator(`a[href="#${date}"]`).click();
      await page.waitForTimeout(300);
    }
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await page.waitForLoadState("domcontentloaded");

    const cancel = page.locator('a[href="/tennisreservation/cancel-reservation"]');
    if ((await cancel.count()) > 0) {
      await cancel.first().click();
      await page.waitForLoadState("domcontentloaded");
    }

    await page.goto(AVAILABILITY_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("div.tab-pane", { timeout: 15_000 });
    return cancelOtherHolds(page, keepSlotId);
  }
}

/**
 * Open a slot by clicking through the availability grid (required — direct /reserve/{id} URLs fail).
 * Returns parsed slot metadata for the chosen id.
 */
export async function openReservePage(page: Page, slotId: string): Promise<Slot> {
  await page.goto(AVAILABILITY_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("div.tab-pane", { timeout: 15_000 });

  const link = page.locator(`a.assign_someone[href="/tennisreservation/reserve/${slotId}"]`);
  if ((await link.count()) === 0) {
    throw new Error(
      `Slot #${slotId} not found on the availability page — it may be booked or not yet released.`
    );
  }

  const label = ((await link.first().textContent()) ?? "").trim();
  if (label === "Continue Booking") {
    log(`Resuming existing hold for slot #${slotId}`);
  } else if (label !== "Reserve this time") {
    throw new Error(`Unexpected slot link label "${label}" for #${slotId}`);
  } else {
    await cancelOtherHolds(page, slotId);
    // Re-locate link after returning from cancel flow
    if ((await link.count()) === 0) {
      throw new Error(
        `Slot #${slotId} not found on the availability page — it may be booked or not yet released.`
      );
    }
  }

  // Activate the day tab so the link is visible (tabs hide off-screen panes)
  const date = await link.first().evaluate((el) => el.closest(".tab-pane")?.id ?? "");
  if (date) {
    await page.locator(`a[href="#${date}"]`).click();
    await page.waitForTimeout(300);
  }

  const slots = parseAvailability(await page.content());
  const slot = slots.find((s) => s.slotId === slotId);
  if (!slot) {
    // Parser only lists "Reserve this time"; synthesize minimal metadata for Continue Booking
    const meta = await link.first().evaluate((el) => {
      const pane = el.closest(".tab-pane");
      const row = el.closest("tr");
      const timeLabel = row?.querySelector("td strong")?.textContent?.trim() ?? "";
      const cell = el.closest("td");
      const colIdx = cell ? Array.from(row?.querySelectorAll("td") ?? []).indexOf(cell) : -1;
      const courtHeader = pane?.querySelectorAll("thead th")?.[colIdx - 1]?.textContent ?? "";
      const court = courtHeader.match(/(\d+)/)?.[1] ?? "0";
      return { date: pane?.id ?? "", timeLabel, court };
    });
    const fallback: Slot = {
      date: meta.date,
      day: meta.date ? weekdayFromIso(meta.date) : "",
      time24: meta.timeLabel ? parseTimeLabel(meta.timeLabel) : "",
      court: parseInt(meta.court, 10),
      slotId,
      url: `https://www.nycgovparks.org/tennisreservation/reserve/${slotId}`,
    };
    await link.first().scrollIntoViewIfNeeded();
    await link.first().click();
    await page.waitForLoadState("domcontentloaded");
    return fallback;
  }

  await link.first().scrollIntoViewIfNeeded();
  await link.first().click();
  await page.waitForLoadState("domcontentloaded");
  return slot;
}

function weekdayFromIso(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    new Date(y, mo - 1, d).getDay()
  ];
}

function parseTimeLabel(label: string): string {
  const m = label.toLowerCase().match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  if (m[3] === "p" && h !== 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Fetch availability HTML using a real browser session (bypasses AWS WAF). */
export async function fetchAvailabilityHtml(page: Page): Promise<string> {
  await page.goto(AVAILABILITY_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("div.tab-pane", { timeout: 15_000 }).catch(() => {});
  return page.content();
}
