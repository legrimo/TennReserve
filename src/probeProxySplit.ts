/** Local Parks-vs-Payflow routing check. No paid proxy, no payment. */
import { runLocalProxySplitCheck } from "./proxySplitCheck.js";

const result = await runLocalProxySplitCheck();

console.log("Parks vs Payflow split (loopback recording proxy, no MobileProxyNow):\n");
for (const row of result.rows) {
  const mark = row.ok ? "ok " : "FAIL";
  console.log(
    `  ${mark}  ${row.host.padEnd(32)} expected ${row.expected.padEnd(6)}  observed ${row.observed}`
  );
}

if (!result.ok) {
  console.error("\nSplit check failed — Parks should hit the recording proxy; Payflow/PayPal must not.");
  process.exit(1);
}

console.log("\nParks went through the proxy adapter; Payflow/PayPal did not.");
console.log("This does not prove a datacenter IP can reach Parks WAF — only the bypass split.");
