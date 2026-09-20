# TennReserve

Auto-books NYC Parks tennis courts (McCarren Park facility 11, Mill Pond facility 4) inside time ranges you tune weekly. Watches the [availability page](https://www.nycgovparks.org/tennisreservation/availability/11) for the selected facility, grabs the first slot matching your targets, and completes checkout through Payflow with a pre-configured (capped, virtual) card.

The dashboard **court location** picker defaults to **Mill Pond** (outdoor McCarren season is closed). Stored attempts and bookings without a `facilityId` still default to McCarren so existing configs keep working.

## Setup

1. **Node** — a bundled Node 22 lives in `.tools/node` (gitignored). Either add it to your PATH or install Node 20+ yourself:

   ```bash
   export PATH="$PWD/.tools/node/bin:$PATH"
   ```

2. **Install dependencies** (already done if `node_modules/` exists):

   ```bash
   npm install
   npm run setup   # only needed for watcher/booking (Playwright + Chromium)
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

Scheduled attempts live in `storage/attempts.json`. The calendar works offline (computed date grid); **live open/booked status on the dashboard uses a plain HTTP fetch** (no Playwright). Watcher and booking still need Playwright — run `npm run setup` once before using those.

**Calendar zones:**
- **Current window** (tomorrow → +7 days) — on NYC Parks now; live availability via HTTP fetch
- **Upcoming staging** (+8 → +28 days) — select slots before the midnight drop; UI splits Next week (+8–+14) and More days this month (+15–+28)

Toggle **Auto-book** in the sidebar (writes `enabled` in `config/targets.yaml`). Legacy yaml day/time ranges still work via CLI but the dashboard uses booking attempts.

Optional notification channels in `.env`: iMessage uses `IMESSAGE_TO` or falls back to `PHONE`; `NOTIFY_EMAIL` + SMTP for email. Grant **Automation** permission (Terminal/Node → Messages) in System Settings. macOS banner alerts always fire locally.

## Commands

```bash
npm run watch                    # poll + auto-book matching slots
npm run watch:headless           # same, headless (required on cloud / no display)
npx tsx src/index.ts slots       # list open slots, mark which match targets
npm run discover -- <slotId>     # open a reserve page, dump form fields + hold timer (no payment)
npm run dry-run -- <slotId>      # full flow up to the Payflow card page, stop before paying
npm run book -- <slotId>         # book a specific slot NOW (real $15 payment)
npm run test:parser              # validate the HTML parser against the captured fixture
npm run test:fetch               # validate HTTP response detection against the fixture
npm run probe-availability       # fetch live NYC Parks page and list open slots
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

## Cloud watcher (DigitalOcean)

Always-on headless watcher on a NYC droplet so booking does not depend on your laptop being awake. Public dashboard hosting is out of scope for now — stage attempts locally, then sync.

**Recommended droplet:** Basic **$12/mo** (2 GB RAM / 1 vCPU), **Ubuntu 24.04**, region **nyc1**, SSH key auth. Firewall: **SSH only** (no public API port yet).

### One-time setup on the droplet

```bash
# As root/admin after first SSH login:
timedatectl set-timezone America/New_York
apt-get update && apt-get install -y git curl ca-certificates

# Node 22 (NodeSource) — or use fnm/nvm and adjust the systemd ExecStart path
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Deploy user + repo
useradd --system --create-home --shell /bin/bash tennreserve
mkdir -p /opt/TennReserve
chown tennreserve:tennreserve /opt/TennReserve
sudo -u tennreserve git clone <your-repo-url> /opt/TennReserve
cd /opt/TennReserve
sudo -u tennreserve npm ci
sudo -u tennreserve npx playwright install --with-deps chromium
```

Install the systemd unit from the repo (paths assume `/opt/TennReserve` and user `tennreserve`):

```bash
sudo cp /opt/TennReserve/scripts/tennreserve-watcher.service /etc/systemd/system/
sudo systemctl daemon-reload
# Sync secrets first (from your laptop — see below), then:
sudo systemctl enable --now tennreserve-watcher
journalctl -u tennreserve-watcher -f
```

The unit runs `watch --headless` with `TZ=America/New_York`. Use `npm run watch:headless` for the same flags interactively.

### Sync from your laptop

After staging/scheduling attempts with `npm run dev` locally:

```bash
./scripts/sync-to-droplet.sh tennreserve@YOUR_DROPLET_IP
# optional once: warm WAF cookies from your Mac profile
./scripts/sync-to-droplet.sh tennreserve@YOUR_DROPLET_IP --with-profile
```

Pushes `.env`, `config/targets.yaml`, and `storage/attempts.json`. Does **not** overwrite remote bookings, ledger, or logs. The watcher re-reads attempts each poll — no restart needed.

Configure **SMTP / `NOTIFY_EMAIL`** in `.env` for cloud alerts (macOS banners and iMessage only work on your Mac).

### Stop the laptop watcher

Only one booker should run. On the Mac:

```bash
launchctl unload ~/Library/LaunchAgents/com.tennreserve.watcher.plist
```

### Day-to-day

1. Schedule attempts on the laptop dashboard  
2. `./scripts/sync-to-droplet.sh tennreserve@…`  
3. Confirm logs show `N scheduled attempt(s)`  
4. Leave the droplet up through the midnight drop; the laptop can sleep  

To pull confirmed bookings back for the local Activity page:

```bash
rsync -az tennreserve@YOUR_DROPLET_IP:/opt/TennReserve/storage/bookings.json storage/
rsync -az tennreserve@YOUR_DROPLET_IP:/opt/TennReserve/storage/ledger.json storage/
```

## Behavior and rules encoded

- Books only slots starting **tomorrow through 7 days out** (site forbids same-day).
- **One booking per day** — the ledger blocks duplicates.
- Watcher polls every 60s, bursts to **3s** during 00:00–00:10 ET (00:00–00:30 when a scheduled attempt is active). When the earliest scheduled drop is **>12h away**, it polls every **15m over HTTP only** (no Chromium). Availability is HTTP-first; Playwright fallback uses a **shared browser context**, with a **~10m cooldown** after WAF/browser use so 1 GB hosts are not thrashing Chromium every minute. Scheduled attempts **skip passes 2–3** when the target day is not on the Parks grid yet.
- **Scheduled booking attempts** take priority over legacy yaml targets. Each attempt walks its slot queue in priority order, up to **3 full passes** per poll cycle (re-fetching between passes 2–3; pass 1 reuses the cycle fetch). If slots are not in the HTML yet, polling continues. If all target slots show **booked/unavailable** on the live grid, the attempt is auto-closed as **missed** with a reason you can inspect in the dashboard. Checkout failures after booking was attempted mark the attempt **failed**.
- Booking failures notify immediately so you can grab the slot manually.

## Safety notes

- Use a **capped virtual card** (e.g. Privacy.com, ~$20/booking limit, merchant-locked). It has already been validated against this exact Payflow flow.
- `storage/`, `.env`, and `*.har` files are gitignored — they hold secrets, sessions, and screenshots with personal data.
- Scope: your own account, your own permit, one reservation a day. Automating a city site may still violate its terms of use — keep usage indistinguishable from normal.
