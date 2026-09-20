import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import type { Facility } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FacilityPickerProps {
  facilities: Facility[];
  value: number;
  onChange: (id: number) => void;
  disabled?: boolean;
  /** Compact label-less row for tight headers. */
  compact?: boolean;
}

export function FacilityPicker({ facilities, value, onChange, disabled, compact }: FacilityPickerProps) {
  return (
    <div>
      {!compact && <Label>Court location</Label>}
      <div
        className={cn("flex flex-wrap gap-2", !compact && "mt-2")}
        role="radiogroup"
        aria-label="Court location"
      >
        {facilities.map((f) => (
          <Button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={value === f.id}
            variant={value === f.id ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(f.id)}
          >
            {f.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
