import express from "express";
import cors from "cors";
import { readFileSync, existsSync } from "node:fs";
import {
  loadTargets,
  saveTargets,
  loadIdentityForUi,
  saveIdentity,
  LOG_PATH,
  type IdentityUpdate,
} from "../config.js";
import { readBookings, getBooking } from "../bookings.js";
import { readLedger } from "../ledger.js";
import { matchSlots } from "../watcher.js";
import { sendTestNotification } from "../notify.js";
import {
  readAttempts,
  getAttempt,
  createAttempt,
  updateAttempt,
  scheduleAttempt,
  cancelAttempt,
  deleteAttempt,
  listScheduledAttempts,
} from "../attempts.js";
import type { TargetsConfig } from "../types.js";
import { getAvailability, getCalendar, msUntilMidnight, resolveSlot } from "./availability.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const TOKEN = process.env.DASHBOARD_TOKEN;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!TOKEN) {
    next();
    return;
  }
  const header = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (header !== TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.use("/api", auth);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/status", (_req, res) => {
  const cfg = loadTargets();
  let recentLog: string[] = [];
  if (existsSync(LOG_PATH)) {
    const lines = readFileSync(LOG_PATH, "utf8").trim().split("\n");
    recentLog = lines.slice(-20);
  }
  res.json({
    enabled: cfg.enabled,
    bookingMode: cfg.bookingMode ?? "first_match",
    targetCount: cfg.targets.length,
    scheduledAttemptCount: listScheduledAttempts().length,
    msUntilMidnight: msUntilMidnight(),
    recentLog,
  });
});

app.get("/api/calendar", (_req, res) => {
  res.json(getCalendar());
});

app.get("/api/targets", (_req, res) => {
  try {
    const cfg = loadTargets();
    res.json({
      ...cfg,
      summary:
        cfg.targets.length === 0
          ? "No yaml targets"
          : `${cfg.enabled ? "Active" : "Paused"} — ${cfg.targets.length} yaml target(s)`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/targets", (req, res) => {
  try {
    const body = req.body as TargetsConfig;
    const cfg: TargetsConfig = {
      enabled: body.enabled === true,
      courts: Array.isArray(body.courts) ? body.courts.map(Number) : [5, 6],
      bookingMode: body.bookingMode === "multi_match" ? "multi_match" : "first_match",
      targets: (body.targets ?? []).map((t) => ({
        day: String(t.day).toLowerCase(),
        between: [String(t.between[0]), String(t.between[1])] as [string, string],
      })),
    };
    saveTargets(cfg);
    res.json(cfg);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/targets/enabled", (req, res) => {
  try {
    const cfg = loadTargets();
    cfg.enabled = req.body.enabled === true;
    saveTargets(cfg);
    res.json({ enabled: cfg.enabled });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/identity", (_req, res) => {
  res.json(loadIdentityForUi());
});

app.put("/api/identity", (req, res) => {
  try {
    saveIdentity(req.body as IdentityUpdate);
    res.json(loadIdentityForUi());
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/ledger", (_req, res) => {
  res.json(readLedger());
});

app.get("/api/bookings", (_req, res) => {
  const bookings = readBookings().sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
  res.json(bookings);
});

app.get("/api/bookings/:id", (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(booking);
});

app.get("/api/bookings/:id/screenshot", (req, res) => {
  const booking = getBooking(req.params.id);
  if (!booking?.receiptScreenshot || !existsSync(booking.receiptScreenshot)) {
    res.status(404).json({ error: "Screenshot not found" });
    return;
  }
  res.sendFile(booking.receiptScreenshot);
});

app.get("/api/availability", async (req, res) => {
  const force = req.query.refresh === "1";
  const snapshot = await getAvailability(force);
  res.json(snapshot);
});

app.get("/api/preview", async (_req, res) => {
  try {
    const cfg = loadTargets();
    const snapshot = await getAvailability();
    const matches = matchSlots(snapshot.slots, cfg);
    res.json({
      enabled: cfg.enabled,
      bookingMode: cfg.bookingMode ?? "first_match",
      matches,
      wouldBook: matches[0] ?? null,
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? "Preview failed" });
  }
});

app.get("/api/slots/resolve", async (req, res) => {
  const date = String(req.query.date ?? "");
  const time24 = String(req.query.time ?? "");
  const court = parseInt(String(req.query.court ?? ""), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time24) || Number.isNaN(court)) {
    res.status(400).json({ error: "date, time (HH:MM), and court required" });
    return;
  }
  const snapshot = await getAvailability();
  const result = resolveSlot(snapshot, date, time24, court);
  if (!result.found) {
    res.status(404).json({ date, time24, court, reason: result.reason });
    return;
  }
  res.json(result.cell);
});

app.get("/api/attempts", (_req, res) => {
  res.json(readAttempts().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.post("/api/attempts", (req, res) => {
  try {
    const attempt = createAttempt(req.body ?? {});
    res.status(201).json(attempt);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/attempts/:id", (req, res) => {
  const attempt = getAttempt(req.params.id);
  if (!attempt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(attempt);
});

app.put("/api/attempts/:id", (req, res) => {
  try {
    res.json(updateAttempt(req.params.id, req.body ?? {}));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/attempts/:id/schedule", (req, res) => {
  try {
    res.json(scheduleAttempt(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/attempts/:id/cancel", (req, res) => {
  try {
    res.json(cancelAttempt(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/attempts/:id", (req, res) => {
  try {
    deleteAttempt(req.params.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/notifications/test", async (_req, res) => {
  try {
    const result = await sendTestNotification();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`TennReserve API listening on http://localhost:${PORT}`);
});
