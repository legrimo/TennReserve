/**
 * Supported NYC Parks tennis facilities.
 *
 * Adding a location is a data change here (id, name, bookable courts/hours).
 * The availability page HTML is shared across parks; the parser reads court
 * numbers from the table header. Do not add facilities without confirming
 * the Parks reservation id and court list.
 */

export const PARKS_ORIGIN = "https://www.nycgovparks.org";

export interface Facility {
  /** NYC Parks tennisreservation facility id (URL path). */
  id: number;
  /** Dashboard / booking display name. */
  name: string;
  /** Bookable court numbers as they appear on the Parks grid. */
  courts: number[];
  /** 1-hour slot start times (24h) shown on the staging calendar. */
  hours: string[];
  /**
   * Substring that must appear in a successful availability HTML response
   * (rejects WAF/error pages). Prefer a court header unique to this facility.
   */
  htmlMarker: string;
}

function hourStarts(fromHour: number, toHour: number): string[] {
  const hours: string[] = [];
  for (let h = fromHour; h <= toHour; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
  }
  return hours;
}

/** Stored attempts/bookings without facilityId are McCarren (pre-multi-facility). */
export const DEFAULT_FACILITY_ID = 11;

/**
 * Dashboard picker default when the user has not chosen a location yet.
 * Mill Pond is the active venue while McCarren's outdoor season is closed.
 */
export const UI_DEFAULT_FACILITY_ID = 4;

const FACILITIES: readonly Facility[] = [
  {
    id: 11,
    name: "McCarren Park",
    courts: [5, 6],
    hours: hourStarts(9, 18),
    htmlMarker: "Court 5",
  },
  {
    id: 4,
    name: "Mill Pond",
    courts: [10, 11, 12],
    hours: hourStarts(8, 19),
    htmlMarker: "Court 10",
  },
];

const BY_ID = new Map(FACILITIES.map((f) => [f.id, f]));

export function listFacilities(): Facility[] {
  return FACILITIES.map((f) => ({ ...f, courts: [...f.courts], hours: [...f.hours] }));
}

export function getFacility(id: number): Facility {
  const facility = BY_ID.get(id);
  if (!facility) {
    const known = FACILITIES.map((f) => `${f.id} (${f.name})`).join(", ");
    throw new Error(`Unknown facility id ${id}. Supported: ${known}`);
  }
  return facility;
}

export function isKnownFacilityId(id: number): boolean {
  return BY_ID.has(id);
}

/** Missing/invalid stored ids fall back to McCarren; unknown numeric ids throw. */
export function resolveFacilityId(id?: number | null): number {
  if (id == null || Number.isNaN(Number(id))) return DEFAULT_FACILITY_ID;
  const n = typeof id === "number" ? id : Number(id);
  if (!Number.isInteger(n)) return DEFAULT_FACILITY_ID;
  getFacility(n);
  return n;
}

export function availabilityUrl(facilityId: number): string {
  getFacility(facilityId);
  return `${PARKS_ORIGIN}/tennisreservation/availability/${facilityId}`;
}

export function isCourtInFacility(facilityId: number, court: number): boolean {
  return getFacility(facilityId).courts.includes(court);
}

export interface FacilitiesApiResponse {
  /** Fallback for stored attempts/bookings with no facilityId. */
  defaultFacilityId: number;
  /** Picker default for a first visit (no localStorage). */
  uiDefaultFacilityId: number;
  facilities: Facility[];
}

export function facilitiesApiResponse(): FacilitiesApiResponse {
  return {
    defaultFacilityId: DEFAULT_FACILITY_ID,
    uiDefaultFacilityId: UI_DEFAULT_FACILITY_ID,
    facilities: listFacilities(),
  };
}
