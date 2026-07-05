import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAttempt, fetchCalendar, type CalendarSnapshot } from "@/lib/api";
import { capitalize } from "@/lib/utils";
import { useEffect, useState } from "react";

export function NewAttemptPage() {
  const [calendar, setCalendar] = useState<CalendarSnapshot | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCalendar()
      .then(setCalendar)
      .catch((e) => toast.error(e.message));
  }, []);

  const stagingDays = calendar?.days.filter((d) => calendar.dayZones[d.date] === "staging") ?? [];

  const start = async (targetDate?: string) => {
    setCreating(true);
    try {
      const attempt = await createAttempt({
        targetDate,
        name: targetDate ? `${capitalize(calendar!.days.find((d) => d.date === targetDate)!.day)} ${targetDate}` : undefined,
      });
      navigate(`/attempts/${attempt.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New booking attempt</h1>
        <p className="text-muted-foreground">Pick a staging day or start blank and choose slots on the calendar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick start — upcoming days</CardTitle>
          <CardDescription>These dates aren't on NYC Parks yet — ideal for midnight drops.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {stagingDays.map((d) => (
            <Button key={d.date} variant="outline" disabled={creating} onClick={() => start(d.date)}>
              {capitalize(d.day)} {d.date.slice(5)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Button disabled={creating} onClick={() => start()}>
        Blank attempt — pick days on staging screen
      </Button>
    </div>
  );
}
