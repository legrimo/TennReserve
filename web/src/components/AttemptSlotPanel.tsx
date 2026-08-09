import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttemptSlotMarker } from "@/components/DayGrid";
import { capitalize, formatTime12 } from "@/lib/utils";

interface AttemptSlotPanelProps {
  marker: AttemptSlotMarker | null;
  onClose: () => void;
  onCancel?: (attemptId: string) => void;
}

export function AttemptSlotPanel({ marker, onClose, onCancel }: AttemptSlotPanelProps) {
  if (!marker) return null;

  const { slot } = marker;

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{marker.name ?? "Booking attempt"}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={marker.status === "scheduled" ? "warning" : "secondary"}>
              {marker.status}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              Priority #{marker.priority} of {marker.totalInAttempt}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {capitalize(slot.day)} {slot.date} · {formatTime12(slot.time24)} · Court {slot.court}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/attempts/${marker.attemptId}`}
            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
          >
            View attempt
          </Link>
          {marker.status === "scheduled" && onCancel && (
            <Button variant="outline" size="sm" onClick={() => onCancel(marker.attemptId)}>
              Cancel schedule
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
