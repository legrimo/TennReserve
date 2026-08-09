export type DayZone = "today" | "published" | "staging";
export type AttemptStatus = "draft" | "scheduled" | "cancelled" | "succeeded" | "failed" | "missed";
export type GridCellStatus = "available" | "booked" | "unavailable" | "held";

export interface GridCell {
  date: string;
  day: string;
  court: number;
  time24: string;
  status: GridCellStatus;
  slotId?: string;
  owned?: boolean;
  reservationNumber?: string;
}

export interface GridDay {
  date: string;
  day: string;
  published: boolean;
  cells: GridCell[];
}

export interface CalendarSnapshot {
  today: string;
  msUntilMidnight: number;
  days: GridDay[];
  dayZones: Record<string, DayZone>;
}

export interface AvailabilitySnapshot extends CalendarSnapshot {
  fetchedAt: string;
  live: boolean;
  error?: string;
  slots: { date: string; day: string; time24: string; court: number; slotId: string }[];
}

export interface SlotPick {
  date: string;
  day: string;
  time24: string;
  court: number;
}

export interface BookingPaymentMethod {
  type: "card";
  last4: string;
  exp?: string;
}

export interface Booking {
  id: string;
  reservationNumber: string;
  scheduledBookingId?: string;
  date: string;
  day: string;
  time24: string;
  court: number;
  slotId: string;
  location: string;
  reservationType?: string;
  paymentSuccess: boolean;
  paymentMethod: BookingPaymentMethod;
  amount?: string;
  receiptScreenshot?: string;
  bookedAt: string;
}

export interface BookingAttempt {
  id: string;
  name?: string;
  status: AttemptStatus;
  slots: SlotPick[];
  createdAt: string;
  scheduledAt?: string;
  missedAt?: string;
  bookingId?: string;
  bookedSlot?: SlotPick & { slotId: string; confirmation: string };
  error?: string;
}

/** @deprecated Use Booking */
export interface BookingRecord {
  date: string;
  day: string;
  time24: string;
  court: number;
  slotId: string;
  confirmation: string;
  bookedAt: string;
}

export interface IdentityUi {
  cardNumberMasked: string;
  cardCvvSet: boolean;
  cardExpMonth: string;
  cardExpYear: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  billingAddress: string;
  billingApt?: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  partyPermits: "none" | "1" | "2";
  permitNumber?: string;
  player2Name?: string;
  player2Permit?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

export const fetchCalendar = () => api<CalendarSnapshot>("/api/calendar");
export const fetchAvailability = (refresh = false) =>
  api<AvailabilitySnapshot>(`/api/availability${refresh ? "?refresh=1" : ""}`);
export const fetchStatus = () =>
  api<{ enabled: boolean; msUntilMidnight: number; scheduledAttemptCount: number; recentLog: string[] }>(
    "/api/status"
  );
export const patchEnabled = (enabled: boolean) =>
  api<{ enabled: boolean }>("/api/targets/enabled", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
export const fetchBookings = () => api<Booking[]>("/api/bookings");
export const fetchBooking = (id: string) => api<Booking>(`/api/bookings/${id}`);
export const bookingScreenshotUrl = (id: string) => `/api/bookings/${id}/screenshot`;
/** @deprecated Use fetchBookings */
export const fetchLedger = () => api<BookingRecord[]>("/api/ledger");
export const fetchIdentity = () => api<IdentityUi>("/api/identity");
export const saveIdentity = (data: Partial<IdentityUi> & { cardNumber?: string; cardCvv?: string }) =>
  api<IdentityUi>("/api/identity", { method: "PUT", body: JSON.stringify(data) });
export const testNotifications = () =>
  api<{ channels: string[]; errors: string[] }>("/api/notifications/test", { method: "POST" });

export const fetchAttempts = () => api<BookingAttempt[]>("/api/attempts");
export const fetchAttempt = (id: string) => api<BookingAttempt>(`/api/attempts/${id}`);
export const createAttempt = (body?: { name?: string; targetDate?: string }) =>
  api<BookingAttempt>("/api/attempts", { method: "POST", body: JSON.stringify(body ?? {}) });
export const updateAttempt = (id: string, body: { name?: string; slots?: SlotPick[] }) =>
  api<BookingAttempt>(`/api/attempts/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const scheduleAttempt = (id: string) =>
  api<BookingAttempt>(`/api/attempts/${id}/schedule`, { method: "POST" });
export const cancelAttempt = (id: string) =>
  api<BookingAttempt>(`/api/attempts/${id}/cancel`, { method: "POST" });
export const deleteAttempt = (id: string) =>
  api<void>(`/api/attempts/${id}`, { method: "DELETE" });
