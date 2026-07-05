import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DayGrid } from "@/components/DayGrid";
import { SlotQueue } from "@/components/SlotQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  cancelAttempt,
  deleteAttempt,
  fetchAttempt,
  fetchAvailability,
  scheduleAttempt,
  updateAttempt,
  type AvailabilitySnapshot,
  type BookingAttempt,
  type SlotPick,
} from "@/lib/api";

function pickKey(p: SlotPick) {
  return `${p.date}-${p.time24}-${p.court}`;
}

export function AttemptStagingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<BookingAttempt | null>(null);
  const [calendar, setCalendar] = useState<AvailabilitySnapshot | null>(null);
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<SlotPick[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [a, avail] = await Promise.all([fetchAttempt(id), fetchAvailability()]);
    setAttempt(a);
    setCalendar(avail);
    setName(a.name ?? "");
    setSlots(a.slots);
    setSelectedDate((prev) => {
      if (prev) return prev;
      if (a.slots[0]) return a.slots[0].date;
      const staging = avail.days.find((d) => avail.dayZones[d.date] === "staging");
      return staging?.date ?? avail.days[1]?.date ?? avail.days[0]?.date ?? null;
    });
  }, [id]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  const persist = async (nextSlots: SlotPick[], nextName?: string) => {
    if (!id || attempt?.status !== "draft") return;
    setSaving(true);
    try {
      const updated = await updateAttempt(id, { slots: nextSlots, name: nextName ?? name });
      setAttempt(updated);
      setSlots(updated.slots);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSlot = (pick: SlotPick) => {
    if (attempt?.status !== "draft") return;
    const key = pickKey(pick);
    const exists = slots.some((s) => pickKey(s) === key);
    const next = exists ? slots.filter((s) => pickKey(s) !== key) : [...slots, pick];
    setSlots(next);
    void persist(next);
  };

  const onSchedule = async () => {
    if (!id) return;
    try {
      await updateAttempt(id, { name, slots });
      const scheduled = await scheduleAttempt(id);
      window.dispatchEvent(new Event("tennreserve:attempts-changed"));
      toast.success("Attempt scheduled — watcher will book when slots open");
      navigate("/", { state: { scheduledId: scheduled.id } });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const onCancel = async () => {
    if (!id) return;
    try {
      await cancelAttempt(id);
      window.dispatchEvent(new Event("tennreserve:attempts-changed"));
      toast.success("Cancelled — nothing will be booked");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setShowCancelConfirm(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    try {
      await deleteAttempt(id);
      toast.success("Deleted");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!attempt || !calendar) {
    return <div className="text-muted-foreground">Loading…</div>;
  }

  const readOnly = attempt.status !== "draft";

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel scheduled attempt?"
        description="TennReserve will stop trying to book these slots. Nothing will be reserved unless you schedule again."
        confirmLabel="Yes, cancel"
        cancelLabel="Keep scheduled"
        destructive
        onConfirm={onCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{readOnly ? attempt.name : "Staging"}</h1>
            <Badge variant="outline">{attempt.status}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {attempt.status === "draft" && (
            <>
              <Button onClick={onSchedule} disabled={slots.length === 0 || saving}>
                Schedule attempt
              </Button>
              <Button variant="outline" onClick={onDelete}>
                Discard
              </Button>
            </>
          )}
          {attempt.status === "scheduled" && (
            <Button variant="outline" onClick={() => setShowCancelConfirm(true)}>
              Cancel schedule
            </Button>
          )}
        </div>
      </div>

      {!calendar.live && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Live overlay unavailable — calendar skeleton still works for staging picks.
        </div>
      )}

      {attempt.status === "draft" && (
        <div className="max-w-md">
          <Label>Attempt name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => persist(slots, name)}
            className="mt-1"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <DayGrid
          calendar={calendar}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          queue={slots}
          onToggleSlot={toggleSlot}
          live={calendar.live}
        />
        <SlotQueue slots={slots} onChange={(next) => { setSlots(next); void persist(next); }} readOnly={readOnly} />
      </div>
    </div>
  );
}
