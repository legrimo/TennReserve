import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelAttempt,
  deleteAttempt,
  fetchAttempts,
  fetchAvailability,
  type AvailabilitySnapshot,
  type BookingAttempt,
} from "@/lib/api";
import { capitalize, formatTime12 } from "@/lib/utils";

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  draft: "secondary",
  scheduled: "warning",
  completed: "success",
  cancelled: "outline",
  failed: "destructive",
};

export function HomePage() {
  const [attempts, setAttempts] = useState<BookingAttempt[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySnapshot | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const loadAttempts = useCallback(async () => {
    const a = await fetchAttempts();
    setAttempts(a);
  }, []);

  const load = useCallback(async () => {
    await loadAttempts();
    fetchAvailability()
      .then(setAvailability)
      .catch(() => {});
  }, [loadAttempts]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load, location.key]);

  useEffect(() => {
    const onRefresh = () => {
      loadAttempts().catch(() => {});
    };
    window.addEventListener("tennreserve:refresh", onRefresh);
    window.addEventListener("tennreserve:attempts-changed", onRefresh);
    return () => {
      window.removeEventListener("tennreserve:refresh", onRefresh);
      window.removeEventListener("tennreserve:attempts-changed", onRefresh);
    };
  }, [loadAttempts]);

  const confirmCancel = async () => {
    if (!cancelId) return;
    try {
      await cancelAttempt(cancelId);
      toast.success("Attempt cancelled — nothing will be booked");
      setCancelId(null);
      await loadAttempts();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteAttempt(id);
      toast.success("Attempt deleted");
      await loadAttempts();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const scheduled = attempts.filter((a) => a.status === "scheduled");
  const other = attempts.filter((a) => a.status !== "scheduled");

  const cancelTarget = attempts.find((a) => a.id === cancelId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ConfirmDialog
        open={!!cancelId}
        title="Cancel scheduled attempt?"
        description={
          cancelTarget
            ? `"${cancelTarget.name ?? "This attempt"}" will not be booked. TennReserve will stop watching these slots unless you schedule again.`
            : "This attempt will not be booked."
        }
        confirmLabel="Yes, cancel"
        cancelLabel="Keep scheduled"
        destructive
        onConfirm={confirmCancel}
        onCancel={() => setCancelId(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Booking attempts</h1>
          <p className="text-muted-foreground">
            Stage slot priorities for upcoming days, then schedule for automatic booking.
          </p>
        </div>
        <Button onClick={() => navigate("/attempts/new")}>
          <Plus className="h-4 w-4" />
          New booking attempt
        </Button>
      </div>

      {availability && !availability.live && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Live availability unavailable — {availability.error?.slice(0, 120) ?? "Playwright not ready"}.
          Staging still works; run <code className="font-mono text-xs">npx playwright install chromium</code> for live
          status.
        </div>
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
              <AttemptCard key={a.id} attempt={a} onCancel={setCancelId} onDelete={onDelete} />
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
              <AttemptCard key={a.id} attempt={a} onCancel={setCancelId} onDelete={onDelete} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AttemptCard({
  attempt,
  onCancel,
  onDelete,
}: {
  attempt: BookingAttempt;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const top = attempt.slots[0];
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{attempt.name ?? attempt.id.slice(0, 8)}</span>
            <Badge variant={statusVariant[attempt.status] ?? "outline"}>{attempt.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {attempt.slots.length} slot(s)
            {top && (
              <>
                {" "}
                · top: {capitalize(top.day)} {formatTime12(top.time24)} Court {top.court}
              </>
            )}
          </p>
          {attempt.bookedSlot && (
            <p className="mt-1 font-mono text-xs text-success">
              Booked #{attempt.bookedSlot.slotId} — {attempt.bookedSlot.confirmation}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {(attempt.status === "draft" || attempt.status === "scheduled") && (
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
          {["draft", "cancelled", "completed", "failed"].includes(attempt.status) && (
            <Button variant="ghost" size="sm" onClick={() => onDelete(attempt.id)}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
