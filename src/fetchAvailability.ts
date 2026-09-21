import { DEFAULT_FACILITY_ID, availabilityUrl, getFacility } from "./facilities.js";
import { log } from "./notify.js";
import {
  getProxyHttpUrl,
  parksHttpDispatcher,
  redactProxyUrl,
  scrubProxySecrets,
} from "./proxy.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let loggedHttpProxy = false;

/**
 * True when HTML looks like an NYC Parks tennis availability grid (not a WAF/error page).
 * When facilityId is given, also require that facility's court-header marker.
 */
export function isAvailabilityHtml(html: string, facilityId?: number): boolean {
  if (!html.includes('class="tab-pane"') || !/Court\s+\d+/i.test(html)) return false;
  if (facilityId == null) return true;
  return html.includes(getFacility(facilityId).htmlMarker);
}

/** Fetch availability HTML via plain HTTP (no Playwright). Uses PROXY_HTTP when set. */
export async function fetchAvailabilityHttp(facilityId: number = DEFAULT_FACILITY_ID): Promise<string> {
  const url = availabilityUrl(facilityId);
  const headers = {
    "User-Agent": BROWSER_UA,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const proxyUrl = getProxyHttpUrl();
  try {
    let res: Response;
    const dispatcher = await parksHttpDispatcher();
    if (dispatcher) {
      if (!loggedHttpProxy && proxyUrl) {
        loggedHttpProxy = true;
        log(`Availability HTTP using PROXY_HTTP (${redactProxyUrl(proxyUrl)})`);
      }
      const { fetch: undiciFetch } = await import("undici");
      res = (await undiciFetch(url, {
        headers,
        redirect: "follow",
        dispatcher,
      })) as unknown as Response;
    } else {
      res = await fetch(url, { headers, redirect: "follow" });
    }
    if (!res.ok) {
      throw new Error(`Availability HTTP ${res.status} for facility ${facilityId}`);
    }
    const html = await res.text();
    if (!isAvailabilityHtml(html, facilityId)) {
      throw new Error("Availability response missing expected grid HTML (WAF block?)");
    }
    return html;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(scrubProxySecrets(message, proxyUrl));
  }
}
