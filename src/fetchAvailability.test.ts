/** Validates isAvailabilityHtml against captured fixtures (no network). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isAvailabilityHtml } from "./fetchAvailability.js";

const here = dirname(fileURLToPath(import.meta.url));
const mccarren = readFileSync(join(here, "..", "fixtures", "availability-11.html"), "utf8");
const millPond = readFileSync(join(here, "..", "fixtures", "availability-4.html"), "utf8");

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ok  ${msg}`);
  } else {
    failures++;
    console.error(`FAIL  ${msg}`);
  }
}

assert(isAvailabilityHtml(mccarren), "McCarren fixture passes generic availability check");
assert(isAvailabilityHtml(mccarren, 11), "McCarren fixture passes facility 11 check");
assert(!isAvailabilityHtml(mccarren, 4), "McCarren fixture rejected as Mill Pond");
assert(isAvailabilityHtml(millPond), "Mill Pond fixture passes generic availability check");
assert(isAvailabilityHtml(millPond, 4), "Mill Pond fixture passes facility 4 check");
assert(!isAvailabilityHtml(millPond, 11), "Mill Pond fixture rejected as McCarren");
assert(!isAvailabilityHtml("<html><body>403 Forbidden</body></html>"), "WAF/error page rejected");
assert(!isAvailabilityHtml(""), "empty response rejected");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nfetch validation tests passed");
