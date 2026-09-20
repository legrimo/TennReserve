/** Fetch live NYC Parks availability and print open slots (manual verification). */
import { DEFAULT_FACILITY_ID, getFacility, resolveFacilityId } from "./facilities.js";
import { fetchAvailabilityHttp } from "./fetchAvailability.js";
import { parseAvailability } from "./parser.js";

const raw = process.argv[2];
const facilityId = raw ? resolveFacilityId(parseInt(raw, 10)) : DEFAULT_FACILITY_ID;
const html = await fetchAvailabilityHttp(facilityId);
const slots = parseAvailability(html, facilityId);
const name = getFacility(facilityId).name;

console.log(
  `${slots.length} open slot(s) at ${name} (facility ${facilityId}) across ${new Set(slots.map((s) => s.date)).size} day(s):\n`
);
for (const s of slots) {
  console.log(`  ${s.date} ${s.day.padEnd(9)} ${s.time24} court ${s.court}  #${s.slotId}`);
}
