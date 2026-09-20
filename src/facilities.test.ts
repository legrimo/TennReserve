import {
  DEFAULT_FACILITY_ID,
  UI_DEFAULT_FACILITY_ID,
  availabilityUrl,
  getFacility,
  isCourtInFacility,
  listFacilities,
  resolveFacilityId,
} from "./facilities.js";
import { validateSlotPicks } from "./attempts.js";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ok  ${msg}`);
  else {
    failures++;
    console.error(`FAIL  ${msg}`);
  }
}

const facilities = listFacilities();
assert(facilities.length === 2, "registry ships McCarren + Mill Pond only");
assert(
  facilities.some((f) => f.id === 11 && f.name === "McCarren Park"),
  "McCarren Park is facility 11"
);
assert(facilities.some((f) => f.id === 4 && f.name === "Mill Pond"), "Mill Pond is facility 4");
assert(DEFAULT_FACILITY_ID === 11, "stored-data default is McCarren (11)");
assert(UI_DEFAULT_FACILITY_ID === 4, "UI picker default is Mill Pond (4)");
assert(resolveFacilityId(undefined) === 11, "missing facilityId resolves to 11");
assert(resolveFacilityId(null) === 11, "null facilityId resolves to 11");
assert(resolveFacilityId(4) === 4, "facility 4 resolves");

assert(
  availabilityUrl(11) === "https://www.nycgovparks.org/tennisreservation/availability/11",
  "McCarren availability URL"
);
assert(
  availabilityUrl(4) === "https://www.nycgovparks.org/tennisreservation/availability/4",
  "Mill Pond availability URL"
);

assert(isCourtInFacility(11, 5) && isCourtInFacility(11, 6), "McCarren courts 5/6");
assert(!isCourtInFacility(11, 10), "Mill Pond court 10 is invalid at McCarren");
assert(
  isCourtInFacility(4, 10) && isCourtInFacility(4, 11) && isCourtInFacility(4, 12),
  "Mill Pond courts 10/11/12"
);
assert(!isCourtInFacility(4, 5), "McCarren court 5 is invalid at Mill Pond");

const mill = getFacility(4);
assert(mill.hours[0] === "08:00" && mill.hours.includes("19:00"), "Mill Pond hours 08:00–19:00");
assert(getFacility(11).hours[0] === "09:00", "McCarren hours start 09:00");

let threw = false;
try {
  getFacility(99);
} catch {
  threw = true;
}
assert(threw, "unknown facility id throws");

threw = false;
try {
  resolveFacilityId(99);
} catch {
  threw = true;
}
assert(threw, "unknown facility id is not silently defaulted");

validateSlotPicks([{ date: "2026-09-28", day: "monday", time24: "18:00", court: 10 }], 4);
threw = false;
try {
  validateSlotPicks([{ date: "2026-09-28", day: "monday", time24: "18:00", court: 10 }], 11);
} catch {
  threw = true;
}
assert(threw, "court 10 rejected for McCarren attempts");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nfacility registry tests passed");
