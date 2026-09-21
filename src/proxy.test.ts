/** Unit tests for PROXY_HTTP bypass list construction (no network, no Playwright). */
import {
  DEFAULT_PROXY_BYPASS,
  getProxyBypassHosts,
  getProxyHttpUrl,
  hostnameBypassesProxy,
  isNycParksHost,
  normalizeBypassHost,
  parseBypassList,
  playwrightBypassString,
  redactProxyUrl,
  scrubProxySecrets,
  startLocalForwardProxy,
} from "./proxy.js";
import { resolveTennBrowser } from "./browser.js";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures++;
    console.error(`FAIL  ${msg}`);
  }
}

const saved = {
  PROXY_HTTP: process.env.PROXY_HTTP,
  PROXY_HTTPS: process.env.PROXY_HTTPS,
  PROXY_BYPASS: process.env.PROXY_BYPASS,
  TENNRESERVE_BROWSER: process.env.TENNRESERVE_BROWSER,
  BROWSER: process.env.BROWSER,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

try {
  assert(normalizeBypassHost("*.paypal.com") === ".paypal.com", "Chromium *.host becomes Firefox .host");
  assert(normalizeBypassHost(" payflowlink.paypal.com ") === "payflowlink.paypal.com", "trim + lowercase");
  assert(normalizeBypassHost(".paypalobjects.com") === ".paypalobjects.com", "leading-dot suffix kept");
  assert(normalizeBypassHost("") === undefined, "empty token dropped");

  const parsed = parseBypassList("payflowlink.paypal.com, *.paypal.com\n.paypalobjects.com,payflowlink.paypal.com");
  assert(
    parsed.join("|") === "payflowlink.paypal.com|.paypal.com|.paypalobjects.com",
    "comma/newline split, wildcard normalize, dedupe"
  );

  assert(isNycParksHost("www.nycgovparks.org"), "www.nycgovparks.org is Parks");
  assert(isNycParksHost("wa.nycgovparks.org"), "wa.nycgovparks.org is Parks");
  assert(isNycParksHost(".nycgovparks.org"), ".nycgovparks.org is Parks");
  assert(isNycParksHost("*.nycgovparks.org"), "*.nycgovparks.org is Parks");
  assert(!isNycParksHost("payflowlink.paypal.com"), "Payflow is not Parks");

  delete process.env.PROXY_BYPASS;
  const defaults = getProxyBypassHosts({});
  assert(defaults.includes("payflowlink.paypal.com"), "default includes payflowlink.paypal.com");
  assert(defaults.includes(".paypal.com"), "default includes .paypal.com suffix");
  assert(defaults.includes(".paypalobjects.com"), "default includes .paypalobjects.com (Fraudnet/assets)");
  assert(
    defaults.join(",") === [...DEFAULT_PROXY_BYPASS].join(","),
    "empty env uses DEFAULT_PROXY_BYPASS"
  );
  assert(
    playwrightBypassString(defaults) === "payflowlink.paypal.com,pilot-payflowlink.paypal.com,.paypal.com,.paypalobjects.com",
    "Playwright bypass string is comma-separated, no spaces"
  );

  const overridden = getProxyBypassHosts({
    PROXY_BYPASS: "payflowlink.paypal.com,*.paypal.com,www.nycgovparks.org,.nycgovparks.org",
  });
  assert(overridden.includes("payflowlink.paypal.com"), "override keeps Payflow host");
  assert(overridden.includes(".paypal.com"), "override normalizes *.paypal.com");
  assert(
    !overridden.some((h) => h.includes("nycgovparks")),
    "Parks hosts are stripped from bypass even if PROXY_BYPASS lists them"
  );

  const bypass = ["payflowlink.paypal.com", ".paypal.com", ".paypalobjects.com"];
  assert(hostnameBypassesProxy("payflowlink.paypal.com", bypass), "exact Payflow host bypasses");
  assert(hostnameBypassesProxy("c.paypal.com", bypass), "Fraudnet c.paypal.com bypasses via .paypal.com");
  assert(hostnameBypassesProxy("www.paypalobjects.com", bypass), "paypalobjects CDN bypasses");
  assert(hostnameBypassesProxy("paypal.com", bypass), ".paypal.com also matches apex paypal.com");
  assert(!hostnameBypassesProxy("www.nycgovparks.org", bypass), "Parks www stays on proxy");
  assert(
    !hostnameBypassesProxy("www.nycgovparks.org", [...bypass, "www.nycgovparks.org"]),
    "Parks never bypasses even if listed"
  );
  assert(
    !hostnameBypassesProxy("www.nycgovparks.org/tennisreservation/payment-endpoint/success".split("/")[0], bypass),
    "payment-endpoint host is still Parks (must stay on proxy)"
  );

  delete process.env.PROXY_HTTP;
  delete process.env.PROXY_HTTPS;
  assert(getProxyHttpUrl() === undefined, "no PROXY_* → no proxy");
  process.env.PROXY_HTTP = "http://user:s3cret-pass@mobile.example:8080";
  assert(getProxyHttpUrl() === "http://user:s3cret-pass@mobile.example:8080", "PROXY_HTTP is read");
  const redacted = redactProxyUrl(process.env.PROXY_HTTP);
  assert(!redacted.includes("s3cret-pass"), "redactProxyUrl strips password");
  assert(!redacted.includes("user"), "redactProxyUrl strips username");
  assert(redacted.includes("mobile.example:8080"), "redactProxyUrl keeps host:port");

  const leaked = scrubProxySecrets(
    `Proxy failed http://user:s3cret-pass@mobile.example:8080 (s3cret-pass)`,
    process.env.PROXY_HTTP
  );
  assert(!leaked.includes("s3cret-pass"), "scrubProxySecrets removes password from errors");
  assert(!leaked.includes("http://user:"), "scrubProxySecrets removes raw proxy URL");

  process.env.BROWSER = "webkit";
  delete process.env.TENNRESERVE_BROWSER;
  assert(resolveTennBrowser() === "firefox", "default browser is firefox; system BROWSER ignored");
  process.env.TENNRESERVE_BROWSER = "chromium";
  assert(resolveTennBrowser() === "chromium", "TENNRESERVE_BROWSER=chromium honored");
  process.env.TENNRESERVE_BROWSER = "chrome";
  assert(resolveTennBrowser() === "chrome", "TENNRESERVE_BROWSER=chrome honored");
  process.env.TENNRESERVE_BROWSER = "firefox";
  assert(resolveTennBrowser() === "firefox", "TENNRESERVE_BROWSER=firefox honored");

  const local = await startLocalForwardProxy("http://127.0.0.1:9", bypass);
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(local.serverUrl), "proxy-chain listens on loopback");
  assert(!local.serverUrl.includes(":9"), "Playwright sees the local adapter, not the upstream port");
  await local.close();
  await local.close(); // idempotent

  const { runLocalProxySplitCheck } = await import("./proxySplitCheck.js");
  const split = await runLocalProxySplitCheck();
  for (const row of split.rows) {
    assert(
      row.ok,
      `${row.host} expected ${row.expected}, observed ${row.observed}`
    );
  }
  assert(split.ok, "Parks CONNECT hits the local recorder; Payflow/PayPal do not");
} finally {
  restoreEnv();
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nproxy bypass tests passed");
