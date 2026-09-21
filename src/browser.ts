import { join } from "node:path";
import { chromium, firefox, type BrowserContext } from "playwright";
import { PROFILE_DIR, STORAGE_DIR } from "./config.js";
import { log } from "./notify.js";
import {
  getProxyBypassHosts,
  getProxyHttpUrl,
  playwrightBypassString,
  redactProxyUrl,
  scrubProxySecrets,
  startLocalForwardProxy,
  type LocalForwardProxy,
} from "./proxy.js";

/**
 * Booker browser. TENNRESERVE_BROWSER defaults to firefox (production + proxy-chain).
 * System `BROWSER` is ignored — Playwright and desktop env often set it to something else.
 */
export type TennBrowser = "firefox" | "chromium" | "chrome";

export function resolveTennBrowser(env: NodeJS.ProcessEnv = process.env): TennBrowser {
  const raw = (env.TENNRESERVE_BROWSER ?? "firefox").trim().toLowerCase();
  if (raw === "firefox" || raw === "chromium" || raw === "chrome") return raw;
  throw new Error(
    `TENNRESERVE_BROWSER must be firefox, chromium, or chrome (got ${JSON.stringify(env.TENNRESERVE_BROWSER)}). System BROWSER is ignored.`
  );
}

function profilePath(kind: TennBrowser): string {
  if (kind === "firefox") return join(STORAGE_DIR, "profile-firefox");
  return PROFILE_DIR;
}

function attachProxyCleanup(context: BrowserContext, local: LocalForwardProxy | undefined): void {
  if (!local) return;
  const originalClose = context.close.bind(context);
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await local.close().catch(() => {});
  };
  context.close = (async (options?: { reason?: string }) => {
    try {
      await originalClose(options);
    } finally {
      await stop();
    }
  }) as typeof context.close;
  context.on("close", () => {
    void stop();
  });
}

function wrapLaunchError(kind: TennBrowser, err: unknown): Error {
  const proxyUrl = getProxyHttpUrl();
  const raw = err instanceof Error ? err.message : String(err);
  const message = scrubProxySecrets(raw, proxyUrl);
  if (kind === "firefox" && /executable doesn't exist/i.test(message)) {
    return new Error(
      "Firefox is not installed for Playwright. On the booker host run: npx playwright install --with-deps firefox"
    );
  }
  return new Error(`Failed to launch ${kind}: ${message}`);
}

async function launchPersistent(
  kind: TennBrowser,
  opts: { headless: boolean; proxy?: { server: string; bypass: string } }
): Promise<BrowserContext> {
  const userDataDir = profilePath(kind === "chrome" ? "chromium" : kind);
  if (kind === "firefox") {
    return firefox.launchPersistentContext(userDataDir, {
      headless: opts.headless,
      viewport: { width: 1280, height: 900 },
      proxy: opts.proxy,
    });
  }
  const common = {
    headless: opts.headless,
    viewport: { width: 1280, height: 900 } as const,
    args: ["--disable-blink-features=AutomationControlled"],
    proxy: opts.proxy,
  };
  if (kind === "chrome") {
    return chromium.launchPersistentContext(userDataDir, { ...common, channel: "chrome" });
  }
  return chromium.launchPersistentContext(userDataDir, common);
}

/**
 * Persistent profile: keeps cookies (incl. AWS WAF tokens) between runs.
 * When PROXY_HTTP is set, Parks stays on that proxy; Payflow/PayPal hosts bypass it.
 */
export async function launchContext(opts: { headless?: boolean } = {}): Promise<BrowserContext> {
  const kind = resolveTennBrowser();
  const headless = opts.headless ?? false;
  const proxyUrl = getProxyHttpUrl();
  const bypass = getProxyBypassHosts();
  const bypassStr = playwrightBypassString(bypass);

  let local: LocalForwardProxy | undefined;
  if (proxyUrl) {
    local = await startLocalForwardProxy(proxyUrl, bypass);
    log(
      `Browser proxy on (${redactProxyUrl(proxyUrl)}); Payflow/PayPal bypass: ${bypassStr}`
    );
  }

  const proxy = local ? { server: local.serverUrl, bypass: bypassStr } : undefined;

  try {
    let context: BrowserContext;
    try {
      context = await launchPersistent(kind, { headless, proxy });
    } catch (err) {
      if (kind !== "chrome") throw err;
      context = await launchPersistent("chromium", { headless, proxy });
    }
    attachProxyCleanup(context, local);
    log(`Launched ${kind} persistent context${headless ? " (headless)" : ""}`);
    return context;
  } catch (err) {
    await local?.close().catch(() => {});
    throw wrapLaunchError(kind, err);
  }
}
