import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { launchContext } from "./browser.js";
import { AVAILABILITY_URL, STORAGE_DIR, SCREENSHOT_DIR } from "./config.js";
import { parseAvailability } from "./parser.js";
import { log } from "./notify.js";

interface FieldInfo {
  tag: string;
  type: string | null;
  name: string | null;
  id: string | null;
  value: string | null;
  required: boolean;
  label: string | null;
  options?: string[];
}

async function dumpForms(page: Page): Promise<{ action: string | null; method: string | null; fields: FieldInfo[] }[]> {
  return page.evaluate(() => {
    const forms: { action: string | null; method: string | null; fields: any[] }[] = [];
    document.querySelectorAll("form").forEach((form: HTMLFormElement) => {
      const fields: any[] = [];
      form.querySelectorAll("input, select, textarea").forEach((el: any) => {
        let label: string | null = null;
        if (el.id) {
          const l = document.querySelector(`label[for="${el.id}"]`);
          if (l) label = (l.textContent ?? "").trim();
        }
        const info: any = {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type"),
          name: el.getAttribute("name"),
          id: el.id || null,
          value: el.type === "password" ? "<redacted>" : el.value ?? null,
          required: el.hasAttribute("required"),
          label,
        };
        if (el.tagName === "SELECT") {
          info.options = Array.from(el.options).slice(0, 40).map((o: any) => o.value);
        }
        fields.push(info);
      });
      forms.push({ action: form.getAttribute("action"), method: form.getAttribute("method"), fields });
    });
    return forms;
  });
}

async function dumpHoldTimer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector("#timeremaining, .hasCountdown, #timeremaining_block");
    return el ? (el.textContent ?? "").trim() : null;
  });
}

/**
 * Discovery run: open a reserve page, capture the checkout form structure,
 * hold timer, HTML and a screenshot — then stop WITHOUT paying.
 *
 * NOTE: clicking a reserve link likely places a temporary hold on the slot
 * until the countdown expires. Prefer running this against a slot you don't mind holding briefly.
 */
export async function discover(slotIdOrUrl?: string): Promise<void> {
  const context = await launchContext({ headless: false });
  const page = await context.newPage();

  try {
    let reserveUrl = slotIdOrUrl;
    if (reserveUrl && /^\d+$/.test(reserveUrl)) {
      reserveUrl = `https://www.nycgovparks.org/tennisreservation/reserve/${reserveUrl}`;
    }

    if (!reserveUrl) {
      log(`No slot specified — loading ${AVAILABILITY_URL} to find one`);
      await page.goto(AVAILABILITY_URL, { waitUntil: "domcontentloaded" });
      const slots = parseAvailability(await page.content());
      if (slots.length === 0) {
        log("No available slots right now; try again with an explicit slot id: npm run discover -- <slotId>");
        return;
      }
      // Pick the furthest-out slot to minimize inconvenience of a brief hold
      const slot = slots[slots.length - 1];
      log(`Using slot ${slot.slotId}: ${slot.date} ${slot.time24} court ${slot.court}`);
      reserveUrl = slot.url;
    }

    log(`Opening reserve page: ${reserveUrl}`);
    await page.goto(reserveUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const report = {
      capturedAt: new Date().toISOString(),
      url: page.url(),
      title: await page.title(),
      holdTimer: await dumpHoldTimer(page),
      forms: await dumpForms(page),
    };

    const jsonPath = join(STORAGE_DIR, `discover-${stamp}.json`);
    const htmlPath = join(STORAGE_DIR, `discover-${stamp}.html`);
    const pngPath = join(SCREENSHOT_DIR, `discover-${stamp}.png`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(htmlPath, await page.content());
    await page.screenshot({ path: pngPath, fullPage: true });

    log(`Landed on: ${report.url}`);
    log(`Hold timer: ${report.holdTimer ?? "not found on this page"}`);
    log(`Forms found: ${report.forms.length}`);
    for (const f of report.forms) {
      log(`  form action=${f.action} method=${f.method}`);
      for (const field of f.fields) {
        log(`    ${field.tag}${field.type ? `[${field.type}]` : ""} name=${field.name} id=${field.id}${field.required ? " required" : ""}${field.label ? ` label="${field.label}"` : ""}`);
      }
    }
    log(`Saved: ${jsonPath}`);
    log(`Saved: ${htmlPath}`);
    log(`Saved: ${pngPath}`);
    log("Discovery complete — no payment was made. If a hold timer started, the slot frees itself when it expires.");
  } finally {
    await context.close();
  }
}
