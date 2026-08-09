/** Fetch live NYC Parks availability and print open slots (manual verification). */
import { fetchAvailabilityHttp } from "./fetchAvailability.js";
import { parseAvailability } from "./parser.js";

const html = await fetchAvailabilityHttp();
const slots = parseAvailability(html);

console.log(`${slots.length} open slot(s) across ${new Set(slots.map((s) => s.date)).size} day(s):\n`);
for (const s of slots) {
  console.log(`  ${s.date} ${s.day.padEnd(9)} ${s.time24} court ${s.court}  #${s.slotId}`);
}
