import { chromium, type BrowserContext } from "playwright";
import { PROFILE_DIR } from "./config.js";

/**
 * Persistent real-Chrome profile: keeps cookies (incl. AWS WAF tokens) between runs,
 * which keeps the bot's footprint close to a normal returning visitor.
 */
export async function launchContext(opts: { headless?: boolean } = {}): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: opts.headless ?? false,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  }).catch(() =>
    // Fall back to bundled Chromium if system Chrome is unavailable
    chromium.launchPersistentContext(PROFILE_DIR, {
      headless: opts.headless ?? false,
      viewport: { width: 1280, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
    })
  );
}
