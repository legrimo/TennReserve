import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLedger, fetchStatus, type BookingRecord } from "@/lib/api";
import { capitalize, formatTime12 } from "@/lib/utils";

export function ActivityPage() {
  const [ledger, setLedger] = useState<BookingRecord[]>([]);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const [entries, status] = await Promise.all([fetchLedger(), fetchStatus()]);
      setLedger(entries.reverse());
      setLog(status.recentLog);
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-muted-foreground">Successful bookings and recent watcher log lines.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <CardDescription>Confirmation numbers from storage/ledger.json</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings recorded yet.</p>
          ) : (
            ledger.map((r) => (
              <div key={`${r.slotId}-${r.bookedAt}`} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="success">Booked</Badge>
                  <span className="font-medium">
                    {capitalize(r.day)} {r.date} · {formatTime12(r.time24)} · Court {r.court}
                  </span>
                </div>
                <div className="mt-2 font-mono text-sm">Confirmation {r.confirmation}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">#{r.slotId}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.bookedAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Watcher log</CardTitle>
          <CardDescription>Last 20 lines from storage/tennreserve.log</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
            {log.length ? log.join("\n") : "No log entries yet."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
