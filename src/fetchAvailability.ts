import { AVAILABILITY_URL } from "./config.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** True when HTML looks like the McCarren availability grid (not a WAF/error page). */
export function isAvailabilityHtml(html: string): boolean {
  return html.includes('class="tab-pane"') && html.includes("Court 5");
}

/** Fetch availability HTML via plain HTTP (no Playwright). */
export async function fetchAvailabilityHttp(): Promise<string> {
  const res = await fetch(AVAILABILITY_URL, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Availability HTTP ${res.status}`);
  }
  const html = await res.text();
  if (!isAvailabilityHtml(html)) {
    throw new Error("Availability response missing expected grid HTML (WAF block?)");
  }
  return html;
}
