/**
 * Single-proxy routing for the booker host.
 *
 * Datacenter egress is CloudFront-blocked for NYC Parks, so availability and
 * Parks checkout use one US-NY mobile HTTP proxy (PROXY_HTTP). Hosted Payflow
 * / PayPal often 403s on that same mobile egress, so those hosts bypass the
 * proxy and use the machine's direct path. There is no second payment proxy.
 *
 * Never log proxy passwords or card numbers.
 */
import { log } from "./notify.js";

/** Playwright / Firefox `network.proxy.no_proxies_on` style (leading-dot = suffix). */
export const DEFAULT_PROXY_BYPASS = [
  "payflowlink.paypal.com",
  "pilot-payflowlink.paypal.com",
  ".paypal.com",
  ".paypalobjects.com",
] as const;

const PARKS_HOST = "nycgovparks.org";

export function getProxyHttpUrl(): string | undefined {
  const raw = process.env.PROXY_HTTP?.trim() || process.env.PROXY_HTTPS?.trim();
  return raw || undefined;
}

/** Strip userinfo so logs never contain the proxy password (or username). */
export function redactProxyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "";
    }
    return u.toString();
  } catch {
    return "[unparseable proxy url]";
  }
}

/** Remove leaked proxy credentials from error text before logging or rethrowing. */
export function scrubProxySecrets(text: string, proxyUrl?: string): string {
  let out = text;
  const url = proxyUrl ?? getProxyHttpUrl();
  if (!url) return out;
  try {
    const u = new URL(url);
    if (u.password) out = out.split(u.password).join("***");
    if (u.username) out = out.split(decodeURIComponent(u.username)).join("***");
    if (u.username) out = out.split(u.username).join("***");
  } catch {
    // ignore parse failures — still try the full URL below
  }
  return out.split(url).join(redactProxyUrl(url));
}

export function isNycParksHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return host === PARKS_HOST || host.endsWith(`.${PARKS_HOST}`);
}

function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
}

/**
 * Chromium-style `*.paypal.com` is not what Firefox/`proxy.bypass` documents.
 * Playwright's example is `.domain.com` (leading dot = suffix match).
 */
export function normalizeBypassHost(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("*.")) return `.${trimmed.slice(2)}`;
  return trimmed;
}

export function parseBypassList(raw: string): string[] {
  const hosts: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\n]/)) {
    const host = normalizeBypassHost(part);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    hosts.push(host);
  }
  return hosts;
}

/**
 * Bypass destinations for Playwright `proxy.bypass` and proxy-chain.
 * Parks hosts are stripped even if listed in PROXY_BYPASS — payment-endpoint
 * and checkout must stay on the mobile proxy.
 */
export function getProxyBypassHosts(env: { PROXY_BYPASS?: string } = process.env): string[] {
  const raw = env.PROXY_BYPASS?.trim();
  const parsed = raw ? parseBypassList(raw) : [...DEFAULT_PROXY_BYPASS];
  const kept: string[] = [];
  let strippedParks = false;
  for (const host of parsed) {
    if (isNycParksHost(host)) {
      strippedParks = true;
      continue;
    }
    kept.push(host);
  }
  if (strippedParks) {
    log("PROXY_BYPASS listed an NYC Parks host — ignoring so Parks stays on PROXY_HTTP");
  }
  return kept;
}

export function playwrightBypassString(hosts: string[] = getProxyBypassHosts()): string {
  return hosts.join(",");
}

/** Match a request hostname against a Playwright-style bypass list. */
export function hostnameBypassesProxy(hostname: string, bypassHosts: string[]): boolean {
  if (isNycParksHost(hostname)) return false;
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  for (const rule of bypassHosts) {
    const r = rule.trim().toLowerCase();
    if (!r) continue;
    if (r.startsWith(".")) {
      const base = r.slice(1);
      if (host === base || host.endsWith(r)) return true;
    } else if (host === r) {
      return true;
    }
  }
  return false;
}

export interface LocalForwardProxy {
  /** Unauthenticated loopback URL Playwright connects to. */
  serverUrl: string;
  close: () => Promise<void>;
}

/**
 * Local proxy-chain adapter: Firefox talks to 127.0.0.1 without credentials;
 * Parks (and everything not on the bypass list) is forwarded to PROXY_HTTP.
 * Bypass hosts are connected directly — a fallback if Firefox ignores
 * Playwright `proxy.bypass`.
 */
export async function startLocalForwardProxy(
  upstreamProxyUrl: string,
  bypassHosts: string[]
): Promise<LocalForwardProxy> {
  const { Server } = await import("proxy-chain");
  const server = new Server({
    port: 0,
    host: "127.0.0.1",
    prepareRequestFunction: ({ hostname }) => {
      if (hostnameBypassesProxy(hostname, bypassHosts)) {
        return {};
      }
      return { upstreamProxyUrl };
    },
  });
  await server.listen();
  const port = server.port;
  let closed = false;
  return {
    serverUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      if (closed) return;
      closed = true;
      await server.close(true);
    },
  };
}

type UndiciDispatcher = import("undici").Dispatcher;

let parksAgent: UndiciDispatcher | undefined;
let parksAgentFor: string | undefined;

/** undici ProxyAgent for Parks HTTP availability when PROXY_HTTP is set. */
export async function parksHttpDispatcher(): Promise<UndiciDispatcher | undefined> {
  const url = getProxyHttpUrl();
  if (!url) return undefined;
  if (parksAgent && parksAgentFor === url) return parksAgent;
  const { ProxyAgent } = await import("undici");
  parksAgent = new ProxyAgent(url);
  parksAgentFor = url;
  return parksAgent;
}
