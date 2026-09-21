/**
 * Prove Parks vs Payflow routing with a loopback recording proxy.
 * No paid MobileProxyNow, no card charge, no real checkout.
 *
 * HTTPS CONNECT to Parks should hit the recorder (stand-in for PROXY_HTTP).
 * CONNECT to Payflow/PayPal must not — those hosts go direct.
 */
import http from "node:http";
import { getProxyBypassHosts, startLocalForwardProxy } from "./proxy.js";

export interface RecordingProxy {
  url: string;
  connects: string[];
  close: () => Promise<void>;
}

export interface ProxySplitRow {
  host: string;
  expected: "proxy" | "direct";
  observed: "proxy" | "direct";
  ok: boolean;
}

export const PROXY_SPLIT_CASES: { host: string; expected: "proxy" | "direct" }[] = [
  { host: "www.nycgovparks.org", expected: "proxy" },
  { host: "wa.nycgovparks.org", expected: "proxy" },
  { host: "payflowlink.paypal.com", expected: "direct" },
  { host: "pilot-payflowlink.paypal.com", expected: "direct" },
  { host: "c.paypal.com", expected: "direct" },
  { host: "www.paypalobjects.com", expected: "direct" },
];

function connectHostname(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(1, end);
  }
  return trimmed.split(":")[0] ?? trimmed;
}

export async function startRecordingUpstreamProxy(): Promise<RecordingProxy> {
  const connects: string[] = [];
  const server = http.createServer((req, res) => {
    const host = connectHostname(String(req.headers.host ?? req.url ?? ""));
    if (host) connects.push(host);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("tennreserve recording proxy");
  });
  server.on("connect", (req, socket) => {
    const host = connectHostname(req.url ?? "");
    if (host) connects.push(host);
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    socket.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("recording proxy failed to bind");
  }

  let closed = false;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    connects,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/** Issue HTTPS CONNECT through an HTTP proxy. Success of the origin tunnel is ignored. */
export async function connectThroughProxy(
  proxyUrl: string,
  hostname: string,
  port = 443,
  timeoutMs = 4000
): Promise<void> {
  const u = new URL(proxyUrl);
  await new Promise<void>((resolve) => {
    const req = http.request({
      protocol: "http:",
      host: u.hostname,
      port: u.port,
      method: "CONNECT",
      path: `${hostname}:${port}`,
      headers: { Host: `${hostname}:${port}` },
    });
    const finish = () => {
      req.destroy();
      resolve();
    };
    req.setTimeout(timeoutMs, finish);
    req.on("connect", (_res, socket) => {
      socket.destroy();
      finish();
    });
    req.on("error", finish);
    req.end();
  });
}

export interface ProxySplitResult {
  ok: boolean;
  rows: ProxySplitRow[];
  recorderUrl: string;
  forwardUrl: string;
}

/**
 * Spin up a fake PROXY_HTTP + the production proxy-chain adapter, then CONNECT
 * Parks and Payflow hosts. Direct PayPal TCP is allowed to fail (blocked egress);
 * we only care whether the recorder saw the CONNECT.
 */
export async function runLocalProxySplitCheck(): Promise<ProxySplitResult> {
  const recorder = await startRecordingUpstreamProxy();
  const bypass = getProxyBypassHosts({});
  const forward = await startLocalForwardProxy(recorder.url, bypass);
  const rows: ProxySplitRow[] = [];
  try {
    for (const { host, expected } of PROXY_SPLIT_CASES) {
      const before = recorder.connects.length;
      await connectThroughProxy(forward.serverUrl, host);
      const hit = recorder.connects.slice(before).some((h) => h === host.toLowerCase());
      const observed: "proxy" | "direct" = hit ? "proxy" : "direct";
      rows.push({ host, expected, observed, ok: observed === expected });
    }
  } finally {
    await forward.close().catch(() => {});
    await recorder.close().catch(() => {});
  }
  return {
    ok: rows.every((r) => r.ok),
    rows,
    recorderUrl: recorder.url,
    forwardUrl: forward.serverUrl,
  };
}
