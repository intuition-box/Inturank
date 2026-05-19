# Email API (Ensend)

This server forwards send-email requests from the app to [Ensend](https://ensend.co) (api.ensend.co) so that your project secret stays server-side.

## Setup

1. **Ensend**
   - Sign up at [Ensend](https://ensend.co) and create a project.
   - In your project, open **Credentials** (or **Settings → Credentials**) and copy:
     - **Project Secret**
     - **Sender Address** (e.g. default like `yourproject@ensend.co` or your custom domain)

2. **Authorized origins**
   - In Ensend, add your app’s origin(s) to the project secret’s **Authorized Origins** (e.g. `http://localhost:5173`, `https://yourapp.com`).  
   - For local dev, add `http://localhost:5173` (or whatever port Vite uses).

3. **Env**
   - In the **project root**, create or edit `.env` or `.env.local` and add:

```env
ENSEND_PROJECT_SECRET=your_project_secret_here
ENSEND_SENDER_EMAIL=yourproject@ensend.co
ENSEND_SENDER_NAME=IntuRank
PORT=3001
```

4. **Run**
   - From project root:
     - **Terminal 1:** `npm run email-server` (starts this server on port 3001).
     - **Terminal 2:** `npm run dev` (Vite proxies `/api` to the email server).
   - With both running, the app sends notification emails through Ensend when users are subscribed and activity happens on their holdings.

### In-app Activity vs. Background Notifications

- **In-app Activity panel (bell icon):** Fetches positions and recent events when the user loads or refreshes the page. It polls every 60 seconds while the page is open. **This is an activity feed, not a push notification system** — it only triggers on page load; there is no background service for real-time in-app alerts.
- **Background email alerts:** For true notifications when the user is away, run the email worker. See [Background email worker](#background-email-worker) below.

## Production: Deploy on Coolify (recommended if self-hosting)

[Coolify](https://coolify.io) can run the same stack as before: one long-lived service with `npm start`, plus `ENABLE_EMAIL_WORKER=true` so the API and background worker share one process (see `server/index.js`). The worker **only starts if Ensend vars are set**; leave `ENABLE_EMAIL_WORKER` unset or `false` to disable background sends (API still serves `/health`, subscribe routes, etc.).

### 1. Create an application

1. In Coolify, **New Resource** → **Application** (or add a service to an existing project).
2. Connect your Git repository and pick the branch you use for this service (often `main`).
3. **Build:**
   - **Dockerfile:** set path to `server/Dockerfile` and **build context** to `.` (repository root).
   - Alternatively, use a **Nixpacks** / Node build with **install** `npm ci` and **start** `npm start` from the repo root (no Dockerfile).

### 2. Port and health

- Coolify sets `PORT`; the server reads `process.env.PORT` (default `3001`).
- Map the public port to the container port Coolify assigns (often the same as `PORT`).
- Optional health check path: `/health`.

### 3. Environment variables

Same as any other host:

| Variable | Value |
|----------|--------|
| `ENSEND_PROJECT_SECRET` | Your Ensend project secret |
| `ENSEND_SENDER_EMAIL` | Your sender email |
| `ENSEND_SENDER_NAME` | `IntuRank` |
| `ENABLE_EMAIL_WORKER` | `true` — background emails when users are away |

Optional: `INTUITION_GRAPH_URL` if you need to override the GraphQL endpoint (see `server/email-worker.js`).

### 4. Persistent storage (important)

Subscriptions and follows are stored in **`email-subs.json`** and **`follows.json`**. By default they live next to the server code; in Docker you should **not** mount over `/app/server` (that would hide `index.js`).

- Set **`EMAIL_DATA_DIR=/app/email-data`** (or any empty folder inside the container).
- In Coolify → your application → **Persistent Storage** (or **Storages**): add a **volume**, name e.g. `inturank-email-data`, **destination path** **`/app/email-data`**.
- Redeploy. After the first subscribe, you should see `email-subs.json` under that path on the volume.

### 5. Point the frontend at Coolify

1. In **Ensend**, add your **production site origin** to **Authorized Origins** (e.g. `https://yourdomain.com`).
2. In **GitHub** → repo → **Settings** → **Secrets and variables** → **Actions**, set **`VITE_EMAIL_API_URL`** to your Coolify public URL (no trailing slash), e.g. `https://email-api.yourdomain.com`.
3. Re-run the **Deploy to GitHub Pages** workflow (or push to `main`) so the built app embeds that URL.

---

## Production: Deploy on Railway

Railway runs the email server 24/7 with no cold starts. Use the same repo; no separate “email-only” repo needed.

### 1. Create the project on Railway

1. Go to [railway.app](https://railway.app) and sign in (GitHub is fine).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select this repo (`IntuRank-Vanguard` or whatever it’s named). Authorize if asked.
4. Railway will create a new **service** from the repo.

### 2. Configure the service

1. Open the new service → **Settings** (or **Variables**).
2. **Build:** Leave defaults. Railway will run `npm install` and use `npm start` (which runs `node server/index.js`).
3. **Root Directory:** Leave blank (repo root is correct).
4. **Start Command:** Leave blank so it uses `npm start`.

### 3. Add environment variables

In the service, go to **Variables** and add:

| Variable | Value |
|----------|--------|
| `ENSEND_PROJECT_SECRET` | Your Ensend project secret |
| `ENSEND_SENDER_EMAIL` | Your sender email (e.g. from Ensend) |
| `ENSEND_SENDER_NAME` | `IntuRank` (or whatever you want) |
| `ENABLE_EMAIL_WORKER` | `true` — enables background email alerts when users are away (optional) |

Do **not** set `PORT`; Railway sets it automatically.

### 4. Get the public URL

1. In the service, open **Settings** → **Networking** (or **Deployments**).
2. Click **Generate Domain**. Railway will assign a URL like `your-service-name-production.up.railway.app`.
3. Copy that URL (no trailing slash). This is your **email API base URL**.

### 5. Tell the frontend to use it

1. In **Ensend**, add your **production site URL** (e.g. `https://yourdomain.com`) to **Authorized Origins**.
2. In **GitHub**: repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Name: `VITE_EMAIL_API_URL`
   - Value: the Railway URL you copied (e.g. `https://your-service-name-production.up.railway.app`).
3. Push to `main` (or re-run the deploy workflow) so the next build uses this URL. After that, the live site will send emails through your Railway server.

---

**Other hosts (Render, Fly.io, etc.):** Deploy the repo, set the same env vars, and run `npm start` (or `node server/index.js`). Then set `VITE_EMAIL_API_URL` in GitHub Actions to that host’s URL.

## Endpoint

- **POST /api/send-email**  
  Body: `{ "to": "user@example.com", "subject": "...", "message": "..." }`  
  Responds with `{ "ok": true }` on success or an error object on failure.

## Background email worker

The in-app Activity panel only fetches when the user has the page open. For **true background notifications** (emails when the user is away), run the email worker:

1. **Option A — Same process (recommended for production):** Set `ENABLE_EMAIL_WORKER=true` in your server env. The worker runs inside the email server and polls subscribed wallets every 60 seconds.
2. **Option B — Separate process:** Run `npm run email-worker` in a separate terminal or as a separate service. It reads subscriptions from `email-subs.json` (same file the server writes when users subscribe).

**Worker env:** Same as the server (`ENSEND_PROJECT_SECRET`, `ENSEND_SENDER_EMAIL`, etc.). Optional: `INTUITION_GRAPH_URL` to override the GraphQL endpoint.

## Follow / activity emails not arriving?

1. **Add your email in the app** — Click the bell (Activity) → **Get email alerts** and enter your email. Follow alerts and activity-on-holdings emails are sent only to that address (stored per wallet in the browser).

2. **Production: set `VITE_EMAIL_API_URL`** — The frontend must know where the email API lives. In production there is no dev proxy: set `VITE_EMAIL_API_URL` to your email server URL (e.g. the Railway URL from step 4 above) in your build environment (e.g. GitHub Actions secret) so the built app calls the correct host.

3. **Server env** — Ensure `ENSEND_PROJECT_SECRET` and `ENSEND_SENDER_EMAIL` are set where this server runs (e.g. Railway variables). If either is missing, the server returns 503 and the app will show "Email is not configured."

4. **Background alerts when user is away** — The in-app Activity panel only fetches on page load. For emails when the user is offline, set `ENABLE_EMAIL_WORKER=true` (see [Background email worker](#background-email-worker)).

## Checklist: Email notifications when user is away

| Step | What | Where |
|------|------|-------|
| 1 | Deploy email server (with worker) to Coolify, Railway, Render, etc. | Your host |
| 2 | Set `ENABLE_EMAIL_WORKER=true` | Server env |
| 3 | Set `ENSEND_PROJECT_SECRET`, `ENSEND_SENDER_EMAIL`, `ENSEND_SENDER_NAME` | Server env |
| 4 | **`EMAIL_DATA_DIR=/app/email-data`** + persistent volume on **`/app/email-data`** | Coolify / host (so subs survive restarts) |
| 5 | Set `VITE_EMAIL_API_URL` to your deployed server URL | GitHub repo → Settings → Secrets → Actions |
| 6 | User subscribes in app (bell → Get email alerts) | IntuRank app |
| 7 | User adds follows (optional; syncs automatically) | IntuRank app |
