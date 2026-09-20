import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DayGrid } from "@/components/DayGrid";
import { FacilityPicker } from "@/components/FacilityPicker";
import { SlotQueue } from "@/components/SlotQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useAvailability } from "@/context/AvailabilityContext";
import {
  cancelAttempt,
  deleteAttempt,
  fetchAttempt,
  scheduleAttempt,
  updateAttempt,
  type BookingAttempt,
  type SlotPick,
} from "@/lib/api";

import { attemptLabel } from "@/lib/utils";

function pickKey(p: SlotPick) {
  return `${p.date}-${p.time24}-${p.court}`;
}

export function AttemptStagingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { availability, error: availabilityError, facilities, selectedFacilityId, setSelectedFacilityId } =
    useAvailability();
  const [attempt, setAttempt] = useState<BookingAttempt | null>(null);
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<SlotPick[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const a = await fetchAttempt(id);
    setAttempt(a);
    setName(a.name ?? "");
    setSlots(a.slots);
    if (a.slots[0]) {
      setSelectedDate(a.slots[0].date);
    }
    if (a.facilityId) setSelectedFacilityId(a.facilityId);
  }, [id, setSelectedFacilityId]);

  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, [load]);

  useEffect(() => {
    if (!availability || !attempt) return;
    if (attempt.status === "draft" && !attempt.slots[0]) {
      const staging = availability.days.find((d) => availability.dayZones[d.date] === "staging");
      if (staging) {
        setSelectedDate(staging.date);
        return;
      }
    }
    if (!attempt.slots[0]) {
      setSelectedDate((prev) => {
        if (prev) return prev;
        const staging = availability.days.find((d) => availability.dayZones[d.date] === "staging");
        return staging?.date ?? availability.days[1]?.date ?? availability.days[0]?.date ?? null;
      });
    }
  }, [availability, attempt]);

  const persist = async (nextSlots: SlotPick[], nextName?: string, nextFacilityId?: number) => {
    if (!id || attempt?.status !== "draft") return;
    setSaving(true);
    try {
      const updated = await updateAttempt(id, {
        slots: nextSlots,
        name: nextName ?? name,
        ...(nextFacilityId != null ? { facilityId: nextFacilityId } : {}),
      });
      setAttempt(updated);
      setSlots(updated.slots);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onFacilityChange = (nextId: number) => {
    if (attempt?.status !== "draft") return;
    setSelectedFacilityId(nextId);
    const allowed = facilities.find((f) => f.id === nextId)?.courts ?? [];
    const nextSlots = slots.filter((s) => allowed.includes(s.court));
    setSlots(nextSlots);
    void persist(nextSlots, name, nextId);
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

  if (!attempt || !availability) {
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
            <h1 className="text-2xl font-semibold tracking-tight">
              {readOnly ? attemptLabel(attempt) : "Staging"}
            </h1>
            <Badge variant="outline">{attempt.status}</Badge>
          </div>
          {(attempt.status === "missed" || attempt.status === "failed") && attempt.error && (
            <p className="mt-2 text-sm text-destructive">{attempt.error}</p>
          )}
          {attempt.status === "missed" && attempt.missedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-closed {new Date(attempt.missedAt).toLocaleString()}
            </p>
          )}
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

      {(availabilityError || !availability.live) && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {availabilityError
            ? `Could not load availability — ${availabilityError}. Try Refresh or reload the page.`
            : "Live overlay unavailable — calendar skeleton still works for staging picks."}
        </div>
      )}

      {attempt.status === "draft" && facilities.length > 0 && (
        <FacilityPicker facilities={facilities} value={selectedFacilityId} onChange={onFacilityChange} />
      )}
      {attempt.status !== "draft" && (
        <p className="text-sm text-muted-foreground">
          {facilities.find((f) => f.id === attempt.facilityId)?.name ?? `Facility ${attempt.facilityId}`}
        </p>
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
          calendar={availability}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          queue={slots}
          onToggleSlot={toggleSlot}
          live={availability.live}
          focusStagingOnly={attempt.status === "draft"}
        />
        <SlotQueue slots={slots} onChange={(next) => { setSlots(next); void persist(next); }} readOnly={readOnly} />
      </div>
    </div>
  );
}
