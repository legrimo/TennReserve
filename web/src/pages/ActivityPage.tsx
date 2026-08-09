import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bookingScreenshotUrl, fetchBookings, fetchStatus, type Booking } from "@/lib/api";
import { capitalize, formatTime12 } from "@/lib/utils";

export function ActivityPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const [entries, status] = await Promise.all([fetchBookings(), fetchStatus()]);
      setBookings(entries);
      setLog(status.recentLog);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">Confirmed bookings and recent watcher log lines.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <CardDescription>Confirmed McCarren reservations with payment details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings recorded yet.</p>
          ) : (
            bookings.map((b) => (
              <div key={b.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">Confirmed</Badge>
                  <span className="font-medium">
                    {capitalize(b.day)} {b.date} · {formatTime12(b.time24)} · Court {b.court}
                  </span>
                </div>
                <div className="mt-2 font-mono text-sm">Reservation {b.reservationNumber}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {b.location}
                  {b.reservationType ? ` · ${b.reservationType}` : ""}
                </div>
                <div className="mt-2 text-sm">
                  Paid with card ••••{b.paymentMethod.last4}
                  {b.amount ? ` · $${b.amount}` : ""}
                  {b.paymentMethod.exp ? ` · exp ${b.paymentMethod.exp}` : ""}
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">Slot #{b.slotId}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Booked {new Date(b.bookedAt).toLocaleString()}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.receiptScreenshot && (
                    <a
                      href={bookingScreenshotUrl(b.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
                    >
                      View receipt
                    </a>
                  )}
                  {b.scheduledBookingId && (
                    <Link
                      to={`/attempts/${b.scheduledBookingId}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
                    >
                      From scheduled booking
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Watcher log</CardTitle>
          <CardDescription>Last 20 lines from storage/tennreserve.log</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {log.length ? log.join("\n") : "No log entries yet."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
