/** Validates the parser against captured availability HTML. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseAvailability, to24h } from "./parser.js";
import { getFacility } from "./facilities.js";

const here = dirname(fileURLToPath(import.meta.url));
const mccarrenHtml = readFileSync(join(here, "..", "fixtures", "availability-11.html"), "utf8");
const millPondHtml = readFileSync(join(here, "..", "fixtures", "availability-4.html"), "utf8");

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

const mccarren = parseAvailability(mccarrenHtml, 11);

// Every assign_someone link in the raw HTML must be captured
const rawLinkCount = (mccarrenHtml.match(/class="assign_someone/g) ?? []).length;
assert(mccarren.length === rawLinkCount, `parsed ${mccarren.length} slots === ${rawLinkCount} raw links`);
assert(mccarren.length > 0, "found at least one McCarren slot");

// Known slot from the capture: Friday July 3, 12:00 p.m., Court 5 -> id 699723
const known = mccarren.find((s) => s.slotId === "699723");
assert(!!known, "slot 699723 exists");
if (known) {
  assert(known.date === "2026-07-03", `699723 date is 2026-07-03 (got ${known.date})`);
  assert(known.day === "friday", `699723 day is friday (got ${known.day})`);
  assert(known.time24 === "12:00", `699723 time is 12:00 (got ${known.time24})`);
  assert(known.court === 5, `699723 court is 5 (got ${known.court})`);
  assert(known.facilityId === 11, `699723 facilityId is 11 (got ${known.facilityId})`);
}

const mccarrenCourts = getFacility(11).courts;
assert(
  mccarren.every(
    (s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^\d{2}:\d{2}$/.test(s.time24) && mccarrenCourts.includes(s.court)
  ),
  "all McCarren slots have valid date/time/court"
);

const millPond = parseAvailability(millPondHtml, 4);
const millPondLinks = (millPondHtml.match(/class="assign_someone/g) ?? []).length;
assert(
  millPond.length === millPondLinks,
  `Mill Pond parsed ${millPond.length} slots === ${millPondLinks} raw links`
);
assert(millPond.length > 0, "found at least one Mill Pond slot");

const millKnown = millPond.find((s) => s.slotId === "713115");
assert(!!millKnown, "Mill Pond slot 713115 exists");
if (millKnown) {
  assert(millKnown.date === "2026-09-21", `713115 date is 2026-09-21 (got ${millKnown.date})`);
  assert(millKnown.day === "monday", `713115 day is monday (got ${millKnown.day})`);
  assert(millKnown.time24 === "08:00", `713115 time is 08:00 (got ${millKnown.time24})`);
  assert(millKnown.court === 10, `713115 court is 10 (got ${millKnown.court})`);
  assert(millKnown.facilityId === 4, `713115 facilityId is 4 (got ${millKnown.facilityId})`);
}

const millCourts = getFacility(4).courts;
assert(
  millPond.every((s) => millCourts.includes(s.court)),
  `all Mill Pond slots use courts ${millCourts.join("/")}`
);
assert(
  millPond.some((s) => s.court === 11) && millPond.some((s) => s.court === 12),
  "Mill Pond fixture includes courts 11 and 12"
);

console.log(
  `\nMcCarren: ${mccarren.length} slots across ${new Set(mccarren.map((s) => s.date)).size} days`
);
console.log(
  `Mill Pond: ${millPond.length} slots across ${new Set(millPond.map((s) => s.date)).size} days`
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nparser tests passed");
