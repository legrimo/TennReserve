import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AttemptSlotPanel } from "@/components/AttemptSlotPanel";
import { DayGrid, type AttemptSlotMarker } from "@/components/DayGrid";
import { FacilityPicker } from "@/components/FacilityPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAvailability } from "@/context/AvailabilityContext";
import {
  cancelAttempt,
  deleteAttempt,
  fetchAttempts,
  fetchBookings,
  type Booking,
  type BookingAttempt,
  type GridCell,
} from "@/lib/api";
import { mergeOwnedBookings } from "@/lib/calendarMerge";
import { attemptLabel, capitalize, facilityIdOf, formatScheduledExecution, formatTime12 } from "@/lib/utils";

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  draft: "secondary",
  scheduled: "warning",
  succeeded: "success",
  cancelled: "outline",
  failed: "destructive",
  missed: "destructive",
};

export function HomePage() {
  const {
    availability,
    loading,
    error,
    refreshedAt,
    facilities,
    selectedFacilityId,
    setSelectedFacilityId,
    defaultFacilityId,
    selectedFacility,
  } = useAvailability();
  const [attempts, setAttempts] = useState<BookingAttempt[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<AttemptSlotMarker | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const loadData = useCallback(async () => {
    const [a, b] = await Promise.all([fetchAttempts(), fetchBookings()]);
    setAttempts(a);
    setBookings(b);
  }, []);

  useEffect(() => {
    loadData().catch((e) => toast.error(e.message));
  }, [loadData, location.key]);

  useEffect(() => {
    const onAttemptsChanged = () => {
      loadData().catch((e) => toast.error(e.message));
    };
    window.addEventListener("tennreserve:attempts-changed", onAttemptsChanged);
    return () => window.removeEventListener("tennreserve:attempts-changed", onAttemptsChanged);
  }, [loadData]);

  useEffect(() => {
    setClockMs(refreshedAt);
  }, [refreshedAt]);

  useEffect(() => {
    const onRefresh = () => {
      setClockMs(Date.now());
      loadData().catch((e) => toast.error(e.message));
    };
    window.addEventListener("tennreserve:refresh", onRefresh);
    return () => window.removeEventListener("tennreserve:refresh", onRefresh);
  }, [loadData]);

  useEffect(() => {
    if (attempts.every((a) => a.status !== "scheduled")) return;
    const id = setInterval(() => setClockMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [attempts]);

  useEffect(() => {
    if (!availability) return;
    setSelectedDate((prev) => {
      if (prev && availability.days.some((d) => d.date === prev)) return prev;
      const firstPublished = availability.days.find((d) => availability.dayZones[d.date] === "published");
      return firstPublished?.date ?? availability.days[0]?.date ?? null;
    });
  }, [availability]);

  const confirmCancel = async () => {
    if (!cancelId) return;
    try {
      await cancelAttempt(cancelId);
      toast.success("Attempt cancelled — nothing will be booked");
      setCancelId(null);
      await loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteAttempt(id);
      toast.success("Attempt deleted");
      await loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const scheduled = attempts.filter((a) => a.status === "scheduled");
  const other = attempts.filter((a) => a.status !== "scheduled");

  const attemptSlotMarkers = useMemo(
    () =>
      attempts
        .filter((a) => a.status === "scheduled" || a.status === "draft")
        .filter((a) => facilityIdOf(a, defaultFacilityId) === selectedFacilityId)
        .flatMap((a) =>
          a.slots.map((slot, i) => ({
            attemptId: a.id,
            status: a.status as "scheduled" | "draft",
            name: attemptLabel(a),
            priority: i + 1,
            totalInAttempt: a.slots.length,
            slot,
          }))
        ),
    [attempts, selectedFacilityId, defaultFacilityId]
  );

  const calendarWithBookings = useMemo(
    () =>
      availability
        ? mergeOwnedBookings(
            availability,
            bookings.filter((b) => facilityIdOf(b, defaultFacilityId) === selectedFacilityId)
          )
        : null,
    [availability, bookings, selectedFacilityId, defaultFacilityId]
  );

  const cancelTarget = attempts.find((a) => a.id === cancelId);

  const showOfflineBanner =
    error || (availability && !availability.live);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ConfirmDialog
        open={!!cancelId}
        title="Cancel scheduled attempt?"
        description={
          cancelTarget
            ? `"${attemptLabel(cancelTarget)}" will not be booked. TennReserve will stop watching these slots unless you schedule again.`
            : "This attempt will not be booked."
        }
        confirmLabel="Yes, cancel"
        cancelLabel="Keep scheduled"
        destructive
        onConfirm={confirmCancel}
        onCancel={() => setCancelId(null)}
      />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Booking attempts</h1>
        <p className="text-muted-foreground">
          Stage slot priorities for upcoming days, then schedule for automatic booking.
        </p>
      </div>

      {showOfflineBanner && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {error
            ? `Could not load availability — ${error}. Try Refresh or reload the page.`
            : `Live availability unavailable — ${availability?.error?.slice(0, 120) ?? "fetch failed"}. Staging still works; check your network or try again shortly.`}
        </div>
      )}

      {facilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Court location</CardTitle>
            <CardDescription>
              Availability and new attempts use this facility. Default for a first visit is Mill Pond;
              existing McCarren attempts still target McCarren.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityPicker
              facilities={facilities}
              value={selectedFacilityId}
              onChange={setSelectedFacilityId}
              compact
            />
          </CardContent>
        </Card>
      )}

      {calendarWithBookings && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Court availability</CardTitle>
              {loading ? (
                <Badge variant="secondary">Loading…</Badge>
              ) : availability?.live ? (
                <Badge variant="success">Live</Badge>
              ) : (
                <Badge variant="secondary">Offline</Badge>
              )}
            </div>
            <CardDescription>
              Four-week view for {selectedFacility?.name ?? "this facility"} — live NYC Parks slots for
              the next 7 days, your booking attempts on staging days through +28.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DayGrid
              calendar={calendarWithBookings}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSelectedMarker(null);
              }}
              queue={[]}
              onToggleSlot={() => {}}
              live={availability?.live}
              readOnly
              attemptSlotMarkers={attemptSlotMarkers}
              onNewAttempt={() => navigate("/attempts/new")}
              onCellSelect={(marker, cell: GridCell) => {
                if (marker) {
                  setSelectedMarker(marker);
                  setSelectedDate(cell.date);
                } else {
                  setSelectedMarker(null);
                }
              }}
            />
            <AttemptSlotPanel
              marker={selectedMarker}
              onClose={() => setSelectedMarker(null)}
              onCancel={setCancelId}
            />
          </CardContent>
        </Card>
      )}

      {!availability && loading && (
        <Card>
          <CardHeader>
            <CardTitle>Court availability</CardTitle>
            <CardDescription>Loading schedule from NYC Parks…</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Scheduled</CardTitle>
          <CardDescription>Active — watcher will book the first open slot in each attempt's queue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled attempts.</p>
          ) : (
            scheduled.map((a) => (
              <AttemptCard
                key={a.id}
                attempt={a}
                now={clockMs}
                facilityName={facilities.find((f) => f.id === facilityIdOf(a, defaultFacilityId))?.name}
                onCancel={setCancelId}
                onDelete={onDelete}
              />
            ))
          )}
        </CardContent>
      </Card>

      {other.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History & drafts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {other.map((a) => (
              <AttemptCard
                key={a.id}
                attempt={a}
                now={clockMs}
                facilityName={facilities.find((f) => f.id === facilityIdOf(a, defaultFacilityId))?.name}
                onCancel={setCancelId}
                onDelete={onDelete}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AttemptCard({
  attempt,
  now,
  facilityName,
  onCancel,
  onDelete,
}: {
  attempt: BookingAttempt;
  now: number;
  facilityName?: string;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const top = attempt.slots[0];
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{attemptLabel(attempt)}</span>
            <Badge variant={statusVariant[attempt.status] ?? "outline"}>{attempt.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {facilityName ? `${facilityName} · ` : ""}
            {attempt.slots.length} slot(s)
            {top && (
              <>
                {" "}
                · top: {capitalize(top.day)} {formatTime12(top.time24)} Court {top.court}
              </>
            )}
          </p>
          {attempt.status === "scheduled" && top && (
            <p className="mt-1 text-sm text-warning">
              Executes {formatScheduledExecution(top.date, new Date(now))}
            </p>
          )}
          {(attempt.status === "missed" || attempt.status === "failed") && attempt.error && (
            <p className="mt-1 text-sm text-destructive">{attempt.error}</p>
          )}
          {attempt.status === "missed" && attempt.missedAt && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Auto-closed {new Date(attempt.missedAt).toLocaleString()}
            </p>
          )}
          {attempt.bookingId ? (
            <p className="mt-1 font-mono text-xs text-success">
              <Link to="/activity" className="hover:underline">
                View booking in Activity
              </Link>
            </p>
          ) : attempt.bookedSlot ? (
            <p className="mt-1 font-mono text-xs text-success">
              Booked #{attempt.bookedSlot.slotId} — {attempt.bookedSlot.confirmation}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {(attempt.status === "draft" || attempt.status === "scheduled" || attempt.status === "succeeded") && (
            <Link
              to={`/attempts/${attempt.id}`}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
            >
              {attempt.status === "draft" ? "Edit" : "View"}
            </Link>
          )}
          {attempt.status === "scheduled" && (
            <Button variant="outline" size="sm" onClick={() => onCancel(attempt.id)}>
              Cancel
            </Button>
          )}
          {["draft", "cancelled", "succeeded", "failed", "missed"].includes(attempt.status) && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(attempt.id)}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
