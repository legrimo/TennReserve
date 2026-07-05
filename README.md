# TennReserve

Auto-books McCarren Park tennis courts (NYC Parks facility 11) inside time ranges you tune weekly. Watches [the availability page](https://www.nycgovparks.org/tennisreservation/availability/11), grabs the first slot matching your targets, and completes checkout through Payflow with a pre-configured (capped, virtual) card.

## Setup

1. **Node** — a bundled Node 22 lives in `.tools/node` (gitignored). Either add it to your PATH or install Node 20+ yourself:

   ```bash
   export PATH="$PWD/.tools/node/bin:$PATH"
   ```

2. **Install dependencies** (already done if `node_modules/` exists):

   ```bash
   npm install
   npx playwright install chromium   # fallback browser; system Chrome is preferred
   ```

3. **Secrets** — copy `.env.example` to `.env` and fill in the virtual card, billing address (must match the card for AVS), name, email, and phone. A permit number is **not** required to complete checkout (select "None" on the form). Never commit `.env`.

4. **Targets** — edit `config/targets.yaml`:

   ```yaml
   enabled: true          # master switch, flip to false to pause the week
   courts: [5, 6]         # preference order
   targets:
     - day: friday
       between: ["17:00", "19:00"]   # any 1-hr slot STARTING in this range
     - day: saturday
       between: ["09:00", "11:00"]
   ```

   The file is re-read every poll cycle — edits apply without restarting.

## Dashboard

Local web UI for staging **booking attempts**, managing payment details, and monitoring activity.

```bash
npm run dev          # API on :3001 + UI on :5173 (proxies /api)
npm run server       # API only
npm run ui           # UI only
```

Open http://localhost:5173

### Booking attempt workflow

1. **New booking attempt** — pick an upcoming staging day (not yet on NYC Parks) or start blank
2. **Staging screen** — click court/time cells to build a **priority queue** (try #1 first, then #2, …)
3. **Schedule** — watcher polls and books the first open slot in the queue when the day releases
4. **Manage** — view, cancel, or delete attempts from the home screen

Scheduled attempts live in `storage/attempts.json`. The calendar works offline (computed date grid); live green/red status requires Playwright (`npm install` runs `playwright install chromium` automatically).

**Calendar zones:**
- **Current window** (tomorrow → +7 days) — on NYC Parks now; live availability when Playwright works
- **Upcoming staging** (+8 → +14 days) — select slots before the midnight drop

Toggle **Auto-book** in the sidebar (writes `enabled` in `config/targets.yaml`). Legacy yaml day/time ranges still work via CLI but the dashboard uses booking attempts.

Optional notification channels in `.env`: iMessage uses `IMESSAGE_TO` or falls back to `PHONE`; `NOTIFY_EMAIL` + SMTP for email. Grant **Automation** permission (Terminal/Node → Messages) in System Settings. macOS banner alerts always fire locally.

## Commands

```bash
npm run watch                    # poll + auto-book matching slots
npx tsx src/index.ts slots       # list open slots, mark which match targets
npm run discover -- <slotId>     # open a reserve page, dump form fields + hold timer (no payment)
npm run dry-run -- <slotId>      # full flow up to the Payflow card page, stop before paying
npm run book -- <slotId>         # book a specific slot NOW (real $15 payment)
npm run test:parser              # validate the HTML parser against the captured fixture
```

Run `discover` once before trusting the booker: it saves the checkout form structure, hold-timer, HTML, and a screenshot to `storage/` so selectors can be verified. Then do one `dry-run`, then one supervised real `book`.

## Run automatically (launchd)

```bash
./scripts/install-launchagent.sh
launchctl load ~/Library/LaunchAgents/com.tennreserve.watcher.plist
# stop with: launchctl unload ~/Library/LaunchAgents/com.tennreserve.watcher.plist
```

The install script writes a local plist from `scripts/com.tennreserve.watcher.plist.example`, substituting your repo path — nothing machine-specific is committed to git.

Logs land in `storage/tennreserve.log` (plus `storage/launchd.*.log`). Successful bookings append to `storage/ledger.json` with the confirmation number and notify via macOS, email, and iMessage (when configured).

## Behavior and rules encoded

- Books only slots starting **tomorrow through 7 days out** (site forbids same-day).
- **One booking per day** — the ledger blocks duplicates.
- Watcher polls every 60s, bursts to 10s during 00:00–00:10 ET (when the new 7th day releases), and backs off exponentially if AWS WAF challenges appear.
- **Scheduled booking attempts** take priority over legacy yaml targets; each attempt tries its slot queue in order.
- Booking failures notify immediately so you can grab the slot manually.

## Safety notes

- Use a **capped virtual card** (e.g. Privacy.com, ~$20/booking limit, merchant-locked). It has already been validated against this exact Payflow flow.
- `storage/`, `.env`, and `*.har` files are gitignored — they hold secrets, sessions, and screenshots with personal data.
- Scope: your own account, your own permit, one reservation a day. Automating a city site may still violate its terms of use — keep usage indistinguishable from normal.
