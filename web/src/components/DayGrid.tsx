import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarSnapshot, GridCell, SlotPick } from "@/lib/api";
import { cn, capitalize, formatTime12 } from "@/lib/utils";

interface DayGridProps {
  calendar: CalendarSnapshot;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  queue: SlotPick[];
  onToggleSlot: (pick: SlotPick) => void;
  live?: boolean;
}

const statusClass: Record<string, string> = {
  available: "bg-success/20 hover:bg-success/30 cursor-pointer",
  booked: "bg-muted text-muted-foreground cursor-not-allowed",
  unavailable: "hover:bg-accent/10 cursor-pointer",
  held: "bg-warning/20 cursor-not-allowed",
  staging: "border border-dashed border-border/70 hover:border-accent hover:bg-accent/10 cursor-pointer",
  queued: "bg-accent/15 ring-2 ring-accent ring-inset cursor-pointer",
};

function cellLabel(
  inQueue: boolean,
  status: string,
  zone: string | undefined,
  published: boolean
): string {
  if (inQueue) return "Queued";
  if (status === "available") return "Open";
  if (status === "booked") return "Booked";
  if (status === "held") return "Held";
  if (zone === "staging" || !published) return "Add";
  return "Add";
}

function pickKey(p: { date: string; time24: string; court: number }) {
  return `${p.date}-${p.time24}-${p.court}`;
}

export function DayGrid({
  calendar,
  selectedDate,
  onSelectDate,
  queue,
  onToggleSlot,
  live,
}: DayGridProps) {
  const queueSet = useMemo(() => new Set(queue.map(pickKey)), [queue]);

  const publishedDays = calendar.days.filter((d) => calendar.dayZones[d.date] === "published");
  const stagingDays = calendar.days.filter((d) => calendar.dayZones[d.date] === "staging");
  const todayDay = calendar.days.find((d) => calendar.dayZones[d.date] === "today");

  const activeDay =
    calendar.days.find((d) => d.date === selectedDate) ?? publishedDays[0] ?? stagingDays[0];

  const times = useMemo(() => {
    if (!activeDay?.cells.length) return [];
    return [...new Set(activeDay.cells.map((c) => c.time24))].sort();
  }, [activeDay]);

  const courts = useMemo(() => {
    if (!activeDay?.cells.length) return [5, 6];
    return [...new Set(activeDay.cells.map((c) => c.court))].sort((a, b) => a - b);
  }, [activeDay]);

  const handleCell = (cell: GridCell) => {
    const zone = calendar.dayZones[cell.date];
    if (zone === "today") return;
    if (cell.status === "booked" || cell.status === "held") return;
    onToggleSlot({ date: cell.date, day: cell.day, time24: cell.time24, court: cell.court });
  };

  const renderDayButton = (d: (typeof calendar.days)[0]) => {
    const zone = calendar.dayZones[d.date];
    const isToday = zone === "today";
    const isStaging = zone === "staging";
    return (
      <button
        key={d.date}
        type="button"
        onClick={() => onSelectDate(d.date)}
        className={cn(
          "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
          selectedDate === d.date ? "border-accent bg-accent/10" : "border-border hover:bg-muted/50",
          isStaging && "candidate-day opacity-80",
          isToday && "ring-1 ring-destructive/40 opacity-60"
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
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {todayDay && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Today</div>
          <div className="flex flex-wrap gap-2">{renderDayButton(todayDay)}</div>
        </div>
      )}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current window (live{live ? "" : " — offline"})
        </div>
        <div className="flex flex-wrap gap-2">{publishedDays.map(renderDayButton)}</div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Upcoming — schedule before midnight drop
        </div>
        <div className="flex flex-wrap gap-2">{stagingDays.map(renderDayButton)}</div>
      </div>

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
                      const isStaging = zone === "staging" || (cell && !activeDay.published);
                      const clickable =
                        cell &&
                        zone !== "today" &&
                        status !== "booked" &&
                        status !== "held";

                      return (
                        <td
                          key={court}
                          className={cn(
                            "border border-border p-1 text-center transition-colors min-h-[2.5rem]",
                            inQueue
                              ? statusClass.queued
                              : isStaging && clickable
                                ? statusClass.staging
                                : statusClass[status],
                            !clickable && "cursor-default opacity-60"
                          )}
                          onClick={() => cell && clickable && handleCell(cell)}
                          title={
                            cell?.slotId
                              ? `#${cell.slotId}`
                              : clickable
                                ? "Click to add to queue"
                                : undefined
                          }
                        >
                          <div
                            className={cn(
                              "text-[10px] uppercase tracking-wide",
                              inQueue && "font-semibold text-accent",
                              !inQueue && clickable && isStaging && "text-muted-foreground group-hover:text-foreground"
                            )}
                          >
                            {cellLabel(!!inQueue, status, zone, activeDay.published)}
                          </div>
                          {cell?.slotId && (
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
          <p className="mt-3 text-xs text-muted-foreground">
            Click <span className="font-medium text-foreground">Add</span> cells to build your queue — staging days
            can be selected before NYC Parks publishes them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
