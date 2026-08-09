/** Validates isAvailabilityHtml against the captured fixture (no network). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isAvailabilityHtml } from "./fetchAvailability.js";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "fixtures", "availability-11.html"), "utf8");

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures++;
    console.error(`FAIL  ${msg}`);
  }
}

assert(isAvailabilityHtml(html), "fixture HTML passes availability check");
assert(!isAvailabilityHtml("<html><body>403 Forbidden</body></html>"), "WAF/error page rejected");
assert(!isAvailabilityHtml(""), "empty response rejected");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nfetch validation tests passed");
