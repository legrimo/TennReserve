import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarSnapshot, GridCell, SlotPick } from "@/lib/api";
import { cn, capitalize, formatTime12 } from "@/lib/utils";

export interface AttemptSlotMarker {
  attemptId: string;
  status: "scheduled" | "draft";
  name?: string;
  priority: number;
  totalInAttempt: number;
  slot: SlotPick;
}

interface DayGridProps {
  calendar: CalendarSnapshot;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  queue: SlotPick[];
  onToggleSlot: (pick: SlotPick) => void;
  live?: boolean;
  readOnly?: boolean;
  attemptSlotMarkers?: AttemptSlotMarker[];
  onNewAttempt?: () => void;
  focusStagingOnly?: boolean;
  onCellSelect?: (marker: AttemptSlotMarker | null, cell: GridCell) => void;
}

const statusClass: Record<string, string> = {
  available: "bg-success/20 hover:bg-success/30 cursor-pointer",
  booked: "bg-muted text-muted-foreground cursor-not-allowed",
  unavailable: "hover:bg-accent/10 cursor-pointer",
  held: "bg-warning/20 cursor-not-allowed",
  staging: "border border-dashed border-border/70 hover:border-accent hover:bg-accent/10 cursor-pointer",
  queued: "bg-accent/15 ring-2 ring-accent ring-inset cursor-pointer",
  scheduled: "bg-warning/20 ring-1 ring-warning/50",
  draft: "bg-secondary/30 ring-1 ring-border",
  owned: "bg-success/25 ring-1 ring-success/60",
};

function pickKey(p: { date: string; time24: string; court: number }) {
  return `${p.date}-${p.time24}-${p.court}`;
}

function markerTooltip(marker: AttemptSlotMarker): string {
  const label = marker.name ?? "Booking attempt";
  return `${label} · priority #${marker.priority} of ${marker.totalInAttempt}`;
}

function liveLabel(status: string, zone: string | undefined, published: boolean, readOnly?: boolean): string {
  if (status === "available") return "Open";
  if (status === "booked") return "Booked";
  if (status === "held") return "Held";
  if (readOnly) return "—";
  if (zone === "staging" || !published) return "Add";
  return "Add";
}

export function DayGrid({
  calendar,
  selectedDate,
  onSelectDate,
  queue,
  onToggleSlot,
  live,
  readOnly,
  attemptSlotMarkers,
  onNewAttempt,
  focusStagingOnly,
  onCellSelect,
}: DayGridProps) {
  const queueSet = useMemo(() => new Set(queue.map(pickKey)), [queue]);

  const markerByCell = useMemo(() => {
    const map = new Map<string, AttemptSlotMarker>();
    for (const marker of attemptSlotMarkers ?? []) {
      map.set(pickKey(marker.slot), marker);
    }
    return map;
  }, [attemptSlotMarkers]);

  const markersByDate = useMemo(() => {
    const map = new Map<string, AttemptSlotMarker[]>();
    for (const marker of attemptSlotMarkers ?? []) {
      const list = map.get(marker.slot.date) ?? [];
      list.push(marker);
      map.set(marker.slot.date, list);
    }
    return map;
  }, [attemptSlotMarkers]);

  const currentWeekDays = useMemo(
    () => calendar.days.filter((d) => calendar.dayZones[d.date] !== "staging"),
    [calendar]
  );

  const stagingDays = useMemo(
    () => calendar.days.filter((d) => calendar.dayZones[d.date] === "staging"),
    [calendar]
  );
  const nextWeekDays = stagingDays.slice(0, 7);
  const moreDays = stagingDays.slice(7);

  const activeDay =
    calendar.days.find((d) => d.date === selectedDate) ??
    calendar.days.find((d) => calendar.dayZones[d.date] === "published") ??
    calendar.days[1];

  const times = useMemo(() => {
    if (!activeDay?.cells.length) return [];
    return [...new Set(activeDay.cells.map((c) => c.time24))].sort();
  }, [activeDay]);

  const courts = useMemo(() => {
    if (!activeDay?.cells.length) return [5, 6];
    return [...new Set(activeDay.cells.map((c) => c.court))].sort((a, b) => a - b);
  }, [activeDay]);

  const handleCell = (cell: GridCell) => {
    if (readOnly) return;
    const zone = calendar.dayZones[cell.date];
    if (zone === "today") return;
    if (cell.status === "booked" || cell.status === "held") return;
    onToggleSlot({ date: cell.date, day: cell.day, time24: cell.time24, court: cell.court });
  };

  const handleCellClick = (cell: GridCell, marker: AttemptSlotMarker | undefined) => {
    if (readOnly && onCellSelect) {
      onCellSelect(marker ?? null, cell);
      return;
    }
    handleCell(cell);
  };

  const renderDayButton = (d: (typeof calendar.days)[0]) => {
    const zone = calendar.dayZones[d.date];
    const isToday = zone === "today";
    const isStaging = zone === "staging";
    const dayMarkers = markersByDate.get(d.date) ?? [];
    const hasScheduled = dayMarkers.some((m) => m.status === "scheduled");
    const blurred = focusStagingOnly && zone !== "staging";

    return (
      <button
        key={d.date}
        type="button"
        onClick={() => !blurred && onSelectDate(d.date)}
        disabled={blurred}
        className={cn(
          "relative rounded-lg border px-3 py-2 text-left text-sm transition-colors",
          selectedDate === d.date ? "border-accent bg-accent/10" : "border-border hover:bg-muted/50",
          isStaging && "candidate-day opacity-80",
          isToday && "ring-1 ring-destructive/40 opacity-60",
          blurred && "pointer-events-none blur-[2px] opacity-40"
        )}
      >
        <div className="font-medium">{capitalize(d.day).slice(0, 3)}</div>
        <div className="font-mono text-xs text-muted-foreground">{d.date.slice(5)}</div>
        {isToday && (
          <Badge variant="destructive" className="mt-1 text-[10px]">
            Today
          </Badge>
        )}
        {isStaging && (
          <Badge variant="secondary" className="mt-1 text-[10px]">
            Staging
          </Badge>
        )}
        {dayMarkers.length > 0 && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 h-2 w-2 rounded-full",
              hasScheduled ? "bg-warning" : "bg-muted-foreground"
            )}
            title={`${dayMarkers.length} slot(s) in attempt(s)`}
          />
        )}
      </button>
    );
  };

  const renderCellContent = (
    inQueue: boolean,
    marker: AttemptSlotMarker | undefined,
    cell: GridCell | undefined,
    status: string,
    zone: string | undefined,
    published: boolean
  ) => {
    if (inQueue) {
      return (
        <div className="text-[10px] font-semibold uppercase tracking-wide text-accent">Queued</div>
      );
    }

    if (cell?.owned) {
      return (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-success">Booked</div>
          {cell.reservationNumber && (
            <div className="font-mono text-[9px] text-muted-foreground">{cell.reservationNumber.slice(0, 8)}…</div>
          )}
        </>
      );
    }

    const isStaging = zone === "staging" || !published;
    const live = liveLabel(status, zone, published, readOnly);

    if (marker && isStaging) {
      return (
        <>
          <div className="font-mono text-xs font-semibold">#{marker.priority}</div>
          <div className="text-[9px] uppercase tracking-wide">
            {marker.status === "scheduled" ? "Scheduled" : "Draft"}
          </div>
        </>
      );
    }

    if (marker && !isStaging) {
      return (
        <>
          <div className="text-[10px] uppercase tracking-wide">{live}</div>
          <div className="font-mono text-[9px] text-warning">#{marker.priority}</div>
        </>
      );
    }

    return <div className="text-[10px] uppercase tracking-wide">{live}</div>;
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Next four weeks</h3>
            <p className="text-sm text-muted-foreground">
              Live slots from NYC Parks · staging days show your booking attempts
            </p>
          </div>
          {live === false && <Badge variant="secondary">Offline</Badge>}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Current week</h4>
            <div className="relative flex flex-wrap gap-2">
              {currentWeekDays.map(renderDayButton)}
              {focusStagingOnly && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg">
                  <p className="rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
                    Focus on next week to build your attempt
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Next week</h4>
            <div className="flex flex-wrap gap-2">{nextWeekDays.map(renderDayButton)}</div>
          </div>

          {moreDays.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">More days this month</h4>
              <div className="flex flex-wrap gap-2">{moreDays.map(renderDayButton)}</div>
            </div>
          )}
        </div>

        {onNewAttempt && (
          <Button size="sm" onClick={onNewAttempt}>
            <Plus className="h-4 w-4" />
            New booking attempt
          </Button>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            {activeDay ? `${capitalize(activeDay.day)}, ${activeDay.date}` : "Select a day"}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {activeDay && (
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-border p-2 text-left font-medium text-muted-foreground">Time</th>
                  {courts.map((c) => (
                    <th key={c} className="border border-border p-2 font-medium">
                      Court {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map((time24) => (
                  <tr key={time24}>
                    <td className="border border-border p-2 font-mono text-xs text-muted-foreground">
                      {formatTime12(time24)}
                    </td>
                    {courts.map((court) => {
                      const cell = activeDay.cells.find((c) => c.time24 === time24 && c.court === court);
                      const status = cell?.status ?? "unavailable";
                      const zone = cell ? calendar.dayZones[cell.date] : undefined;
                      const inQueue = cell && queueSet.has(pickKey(cell));
                      const marker = cell ? markerByCell.get(pickKey(cell)) : undefined;
                      const isStaging = zone === "staging" || (cell && !activeDay.published);
                      const isOwned = cell?.owned;
                      const clickable =
                        !readOnly &&
                        cell &&
                        zone !== "today" &&
                        !isOwned &&
                        status !== "booked" &&
                        status !== "held";
                      const selectable = readOnly && onCellSelect && cell && marker && !isOwned;

                      return (
                        <td
                          key={court}
                          className={cn(
                            "border border-border p-1 text-center transition-colors min-h-[2.5rem]",
                            inQueue
                              ? statusClass.queued
                              : isOwned
                                ? statusClass.owned
                                : marker
                                  ? statusClass[marker.status]
                                  : isStaging && clickable
                                    ? statusClass.staging
                                    : statusClass[status],
                            !clickable && !marker && !selectable && !isOwned && "cursor-default opacity-60",
                            (selectable || clickable) && "cursor-pointer"
                          )}
                          onClick={() => cell && (selectable || clickable) && handleCellClick(cell, marker)}
                          title={
                            isOwned && cell.reservationNumber
                              ? `Your booking · ${cell.reservationNumber}`
                              : marker
                                ? markerTooltip(marker)
                                : cell?.slotId
                                  ? `#${cell.slotId}`
                                  : clickable
                                    ? "Click to add to queue"
                                    : readOnly && onCellSelect
                                      ? "Click to inspect"
                                      : undefined
                          }
                        >
                          {cell &&
                            renderCellContent(!!inQueue, marker, cell, status, zone, activeDay.published)}
                          {cell?.slotId && !marker && !isOwned && (
                            <div className="font-mono text-[10px] text-muted-foreground">#{cell.slotId}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!readOnly && (
            <p className="mt-3 text-xs text-muted-foreground">
              Click <span className="font-medium text-foreground">Add</span> cells to build your queue — staging days
              can be selected before NYC Parks publishes them.
            </p>
          )}
          {readOnly && onCellSelect && (
            <p className="mt-3 text-xs text-muted-foreground">
              Click a highlighted slot to see attempt details.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
