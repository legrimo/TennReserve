import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SlotPick } from "@/lib/api";
import { capitalize, formatTime12 } from "@/lib/utils";

interface SlotQueueProps {
  slots: SlotPick[];
  onChange: (slots: SlotPick[]) => void;
  readOnly?: boolean;
}

function pickKey(p: SlotPick) {
  return `${p.date}-${p.time24}-${p.court}`;
}

export function SlotQueue({ slots, onChange, readOnly }: SlotQueueProps) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...slots];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(slots.filter((_, i) => i !== idx));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Priority queue</CardTitle>
        <CardDescription>
          {readOnly
            ? "Booking order — first available slot wins"
            : "Drag order with arrows. #1 is tried first at release."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No slots selected — click the calendar to add picks.</p>
        ) : (
          slots.map((s, i) => (
            <div
              key={pickKey(s)}
              className="flex items-center gap-2 rounded-md border border-border px-2 py-2 text-sm"
            >
              <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                #{i + 1}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {capitalize(s.day)} {s.date.slice(5)} · {formatTime12(s.time24)}
                </div>
                <div className="text-xs text-muted-foreground">Court {s.court}</div>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => move(i, 1)}
                    disabled={i === slots.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
