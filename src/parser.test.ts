/** Validates the parser against the captured availability HTML (fixtures/availability-11.html). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseAvailability, to24h } from "./parser.js";

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

// time conversion
assert(to24h("6:00 a.m.") === "06:00", 'to24h("6:00 a.m.") === "06:00"');
assert(to24h("12:00 p.m.") === "12:00", 'to24h("12:00 p.m.") === "12:00"');
assert(to24h("12:00 a.m.") === "00:00", 'to24h("12:00 a.m.") === "00:00"');
assert(to24h("5:00 p.m.") === "17:00", 'to24h("5:00 p.m.") === "17:00"');

const slots = parseAvailability(html);

// Every assign_someone link in the raw HTML must be captured
const rawLinkCount = (html.match(/class="assign_someone/g) ?? []).length;
assert(slots.length === rawLinkCount, `parsed ${slots.length} slots === ${rawLinkCount} raw links`);
assert(slots.length > 0, "found at least one slot");

// Known slot from the capture: Friday July 3, 12:00 p.m., Court 5 -> id 699723
const known = slots.find((s) => s.slotId === "699723");
assert(!!known, "slot 699723 exists");
if (known) {
  assert(known.date === "2026-07-03", `699723 date is 2026-07-03 (got ${known.date})`);
  assert(known.day === "friday", `699723 day is friday (got ${known.day})`);
  assert(known.time24 === "12:00", `699723 time is 12:00 (got ${known.time24})`);
  assert(known.court === 5, `699723 court is 5 (got ${known.court})`);
}

// Sanity: all slots have valid shape
assert(
  slots.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.time24) && [5, 6].includes(s.court)),
  "all slots have valid date/time/court"
);

console.log(`\n${slots.length} slots parsed across ${new Set(slots.map((s) => s.date)).size} days`);
for (const s of slots) console.log(`  ${s.date} ${s.day.padEnd(9)} ${s.time24} court ${s.court}  #${s.slotId}`);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nparser tests passed");
