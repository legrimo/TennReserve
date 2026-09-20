import { DEFAULT_FACILITY_ID, availabilityUrl, getFacility } from "./facilities.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * True when HTML looks like an NYC Parks tennis availability grid (not a WAF/error page).
 * When facilityId is given, also require that facility's court-header marker.
 */
export function isAvailabilityHtml(html: string, facilityId?: number): boolean {
  if (!html.includes('class="tab-pane"') || !/Court\s+\d+/i.test(html)) return false;
  if (facilityId == null) return true;
  return html.includes(getFacility(facilityId).htmlMarker);
}

/** Fetch availability HTML via plain HTTP (no Playwright). */
export async function fetchAvailabilityHttp(facilityId: number = DEFAULT_FACILITY_ID): Promise<string> {
  const url = availabilityUrl(facilityId);
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Availability HTTP ${res.status} for facility ${facilityId}`);
  }
  const html = await res.text();
  if (!isAvailabilityHtml(html, facilityId)) {
    throw new Error("Availability response missing expected grid HTML (WAF block?)");
  }
  return html;
}
