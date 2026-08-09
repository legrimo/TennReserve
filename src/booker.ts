import { join } from "node:path";
import type { Page, Locator } from "playwright";
import { launchContext } from "./browser.js";
import { SCREENSHOT_DIR, loadIdentity, type Identity } from "./config.js";
import { openReservePage } from "./navigate.js";
import { log, notifyBooking } from "./notify.js";
import type { BookingResult, Slot } from "./types.js";

const PAYFLOW_HOST = "payflowlink.paypal.com";

function checkoutForm(page: Page): Locator {
  return page.locator("#form_with_validation");
}

/** Fail fast if we didn't land on the reserve/checkout form. */
async function assertCheckoutPage(page: Page): Promise<Locator> {
  const err = page.locator(".alert-error").filter({ hasText: /error has occurred/i });
  if (await err.isVisible().catch(() => false)) {
    const onLanding =
      page.url().includes("/tennisreservation") && !page.url().includes("/reserve/");
    throw new Error(
      onLanding
        ? "NYC Parks rejected the reservation — you may already have an active hold on another slot. Cancel it on the site or wait for the 15-minute timer to expire, then retry."
        : "NYC Parks error page — slot may already be held, taken, or expired. Try another slot."
    );
  }
  if (page.url().includes("/availability/")) {
    throw new Error("Slot no longer available (redirected back to availability)");
  }
  const form = checkoutForm(page);
  await form.waitFor({ state: "visible", timeout: 15_000 });
  return form;
}

async function clickContinueToPayflow(page: Page): Promise<void> {
  const btn = page
    .locator("main, #content, .content, body")
    .getByRole("button", { name: /Continue to Payment/i })
    .first();
  if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
    await Promise.all([
      page.waitForURL((u) => u.host === PAYFLOW_HOST, { timeout: 45_000 }),
      btn.click(),
    ]);
    return;
  }
  const inputBtn = page.locator('input[type="submit"][value*="Continue to Payment" i]').first();
  if ((await inputBtn.count()) > 0 && (await inputBtn.isVisible().catch(() => false))) {
    await Promise.all([
      page.waitForURL((u) => u.host === PAYFLOW_HOST, { timeout: 45_000 }),
      inputBtn.click(),
    ]);
    return;
  }
  throw new Error("Could not find Continue to Payment on the review page");
}

async function screenshot(page: Page, name: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(SCREENSHOT_DIR, `${name}-${stamp}.png`);
  await page.screenshot({ path, fullPage: true }).catch(() => {});
  return path;
}

/** Fill the first matching, visible element inside scope; returns true if filled. */
async function fillIfPresent(scope: Page | Locator, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    const el = scope.locator(sel).first();
    if ((await el.count()) === 0) continue;
    if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue;
    const tag = await el.evaluate((e) => e.tagName.toLowerCase());
    if (tag === "select") {
      await el.selectOption({ value }).catch(async () => el.selectOption({ label: value }).catch(() => {}));
    } else {
      await el.fill(value).catch(() => {});
    }
    return true;
  }
  return false;
}

/**
 * Fill the NYC Parks checkout form (between "Reserve this time" and Payflow).
 * Selects singles (2 players) and how many in the party have permits (`single_play_exist`).
 */
async function fillCheckoutForm(page: Page, id: Identity): Promise<void> {
  const scope = await assertCheckoutPage(page);

  // "How many people will be playing?" — 2 = singles for 1 hour
  await scope.locator('input[name="num_players"][value="2"]').check();

  // "How many in your party have a season tennis permit or single play ticket?"
  const permitCount = id.partyPermits === "none" ? "0" : id.partyPermits;
  await scope.locator(`input[name="single_play_exist"][value="${permitCount}"]`).check();

  if (id.permitNumber) {
    await fillIfPresent(scope, ["#permit-number1", 'input[name="permit-number1"]'], id.permitNumber);
    await fillIfPresent(
      scope,
      ["#name1", 'input[name="name1"]'],
      id.player2Name ?? `${id.firstName} ${id.lastName}`
    );
    if (id.player2Permit) {
      await fillIfPresent(scope, ["#permit-number2", 'input[name="permit-number2"]'], id.player2Permit);
      await fillIfPresent(scope, ["#name2", 'input[name="name2"]'], id.player2Name ?? "");
    }
  }

  const fullName = `${id.firstName} ${id.lastName}`;
  if (!(await fillIfPresent(scope, ['input[name="name"]', "#name"], fullName))) {
    await scope.getByLabel(/^Name/i).fill(fullName, { timeout: 5_000 });
  }
  await fillIfPresent(scope, ['input[name="email"]', "#email", 'input[type="email"]'], id.email);
  await fillIfPresent(scope, ['input[name="address"]', "#address", 'input[name*="address" i]'], id.billingAddress);
  if (id.billingApt) {
    await fillIfPresent(scope, ['input[name="address2"]', "#address2", 'input[name*="apartment" i]'], id.billingApt);
  }
  await fillIfPresent(scope, ['input[name="city"]', "#city"], id.billingCity);
  await fillIfPresent(scope, ['input[name="state"]', "#state", 'select[name="state"]'], id.billingState);
  await fillIfPresent(scope, ['input[name="zip"]', "#zip", 'input[name*="zip" i]'], id.billingZip);
  await fillIfPresent(scope, ['input[name="phone"]', "#phone", 'input[type="tel"]'], id.phone);
}

/** Fill the hosted Payflow Link card form (field names verified from the successful HAR capture). */
async function fillPayflowForm(page: Page, id: Identity): Promise<void> {
  await fillIfPresent(page, ['input[name="CARDNUM"]', "#CARDNUM"], id.cardNumber);
  await fillIfPresent(page, ['select[name="EXPMONTH"]', 'input[name="EXPMONTH"]'], id.cardExpMonth);
  // EXPYEAR was 2-digit ("29") in the capture; try both forms
  const yy = id.cardExpYear.length === 4 ? id.cardExpYear.slice(2) : id.cardExpYear;
  const yearFilled = await fillIfPresent(page, ['select[name="EXPYEAR"]'], yy);
  if (!yearFilled) await fillIfPresent(page, ['input[name="EXPYEAR"]'], yy);
  await fillIfPresent(page, ['input[name="CVV2"]', "#CVV2"], id.cardCvv);

  await fillIfPresent(page, ['input[name="first_name"]'], id.firstName);
  await fillIfPresent(page, ['input[name="last_name"]'], id.lastName);
  await fillIfPresent(page, ['input[name="billingAddress1"]'], id.billingAddress);
  await fillIfPresent(page, ['input[name="billingCity"]'], id.billingCity);
  await fillIfPresent(page, ['select[name="STATE"]', 'input[name="STATE"]'], id.billingState);
  await fillIfPresent(page, ['input[name="billingZip"]'], id.billingZip);
  await fillIfPresent(page, ['input[name="EMAIL"]'], id.email);
}

async function clickContinueToPayment(page: Page): Promise<void> {
  const form = await assertCheckoutPage(page);
  const btn = form.locator('input[name="submit_payment"], button[name="submit_payment"]').first();
  if ((await btn.count()) > 0 && (await btn.isVisible())) {
    await btn.click();
  } else {
    const byText = form.getByRole("button", { name: /Continue to Payment/i });
    if ((await byText.count()) > 0) {
      await byText.click();
    } else {
      throw new Error("Could not find Continue to Payment inside #form_with_validation");
    }
  }

  // NYC Parks shows a review page before redirecting to hosted Payflow
  await page.waitForURL(
    (u) => u.host === PAYFLOW_HOST || u.pathname.includes("/payment/review/"),
    { timeout: 45_000 }
  );
  if (page.url().includes("/payment/review/")) {
    log("Reviewing purchase summary");
    await clickContinueToPayflow(page);
  }
}

async function clickPayflowSubmit(page: Page): Promise<void> {
  const scope = page.locator("form").filter({ has: page.locator('input[name="CARDNUM"]') });
  const candidates = [
    scope.locator('input[type="submit"][value*="Pay" i]'),
    scope.getByRole("button", { name: /Pay/i }),
    scope.locator('input[type="submit"]'),
    scope.locator('button[type="submit"]'),
  ];
  for (const el of candidates) {
    if ((await el.count()) > 0 && (await el.first().isVisible().catch(() => false))) {
      await el.first().click();
      return;
    }
  }
  throw new Error("Could not find the Payflow submit button");
}

export interface BookOptions {
  dryRun?: boolean;
  headless?: boolean;
  /** When false, skip failure notifications (used during in-pass retries). Default true. */
  notifyOnFailure?: boolean;
}

/**
 * Full booking flow: reserve link -> checkout form -> Payflow -> thank-you.
 * With dryRun, stops at the Payflow card page without entering or submitting card data.
 */
export async function book(slotOrId: Slot | string, opts: BookOptions = {}): Promise<BookingResult> {
  const id = loadIdentity();
  const context = await launchContext({ headless: opts.headless ?? false });
  const page = await context.newPage();
  let slotId = typeof slotOrId === "string" ? slotOrId : slotOrId.slotId;
  let label = `#${slotId}`;

  try {
    log(`Booking slot #${slotId} — opening via availability page`);
    const slot = await openReservePage(page, slotId);
    slotId = slot.slotId;
    label = `${slot.date} ${slot.time24} court ${slot.court} (#${slot.slotId})`;

    log("Filling checkout form");
    await fillCheckoutForm(page, id);
    await screenshot(page, `checkout-${slot.slotId}`);

    log("Continuing to payment");
    await clickContinueToPayment(page);
    await page.waitForTimeout(1500); // let the hosted form + Fraudnet settle

    if (opts.dryRun) {
      const shot = await screenshot(page, `dryrun-payflow-${slot.slotId}`);
      log(`DRY RUN: reached Payflow card page, stopping before payment. Screenshot: ${shot}`);
      log("Note: the slot hold will release when the checkout timer expires.");
      return { ok: true, dryRun: true, screenshot: shot };
    }

    log("Filling Payflow card form");
    await fillPayflowForm(page, id);
    await screenshot(page, `payflow-${slot.slotId}`);

    log("Submitting payment");
    await clickPayflowSubmit(page);

    // Payflow posts back to nycgovparks payment-endpoint/success, which redirects to the thank-you page
    await page.waitForURL((u) => u.pathname.includes("/tennisreservation/thankyou"), { timeout: 60_000 });
    const body = (await page.textContent("body")) ?? "";
    const confMatch = body.match(/Confirmation Number:\s*([A-Za-z0-9]+)/i);
    const reservationNumber = confMatch ? confMatch[1] : "UNKNOWN";
    const amountMatch = body.match(/\$\s*([\d,.]+)/);
    const amount = amountMatch ? amountMatch[1] : undefined;
    const shot = await screenshot(page, `confirmed-${slot.slotId}`);

    const cardLast4 = id.cardNumber.replace(/\D/g, "").slice(-4) || "????";
    const checkout = {
      slot,
      reservationNumber,
      receiptScreenshot: shot,
      amount,
      paymentMethod: {
        type: "card" as const,
        last4: cardLast4,
        exp: `${id.cardExpMonth}/${id.cardExpYear.length === 4 ? id.cardExpYear.slice(2) : id.cardExpYear}`,
      },
    };

    await notifyBooking({
      success: true,
      title: "TennReserve: booked!",
      message: `${label} — confirmation ${reservationNumber}`,
    });
    return { ok: true, confirmation: reservationNumber, screenshot: shot, checkout };
  } catch (err: any) {
    const shot = await screenshot(page, `failed-${slotId}`);
    const message = err?.message ?? String(err);
    if (!opts.dryRun && opts.notifyOnFailure !== false) {
      await notifyBooking({
        success: false,
        title: "TennReserve: booking FAILED",
        message: `${label} — ${message}`,
      });
    }
    log(`Booking failed: ${label} — ${message}`);
    log(`Failure screenshot: ${shot}`);
    return { ok: false, error: message, screenshot: shot };
  } finally {
    await context.close();
  }
}
