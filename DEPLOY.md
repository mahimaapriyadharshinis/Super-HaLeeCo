# Deploying a public demo

HaLeeCo is built to run entirely local-first, but the server can also run in
a single container for a hosted, no-login demo — useful for showing the
project to someone who isn't going to clone and run it themselves.

## What demo mode changes

Setting `DEMO_MODE=true` makes the server seed a small sample deck (a dozen
or so real public problems across LeetCode, Codeforces, and HackerRank) on
first boot if the database is empty, so a fresh deploy has something to show
immediately with no LeetCode login required. It only seeds once — if the
database already has problems, it's a no-op.

Real account features (Connect LeetCode, Sync Mine) still work if a visitor
wants to try them, but obviously require their own LeetCode session — they
aren't part of what demo mode sets up.

## AI features on a public deploy: bring-your-own-key

If you deploy this publicly, do **not** set `GEMINI_API_KEY` on the hosting
platform — every visitor's AI-generated solutions/quizzes would draw down
your own personal Gemini quota. Instead, leave it unset: the client shows a
"SET AI KEY" button (sidebar) / "Use your own Gemini key" prompt (Add Cards
panel) that lets each visitor paste their own free key
(https://aistudio.google.com/apikey). It's stored only in their browser's
localStorage and sent only as a per-request header on their own AI calls —
never persisted anywhere server-side. Without a key, everything still works
except AI generation; cards just get blank code instead.

## Build and run locally with Docker

```bash
docker build -t haleeco .
docker run -p 5174:5174 -e DEMO_MODE=true haleeco
```

Then open http://localhost:5174 — the same container serves both the API
and the built client.

To carry over AI-generated solutions/quizzes, pass a Gemini key:

```bash
docker run -p 5174:5174 -e DEMO_MODE=true -e GEMINI_API_KEY=your-key haleeco
```

The SQLite database lives inside the container at `/app/server/flashcards.db`
by default, so it resets on every redeploy — fine for a demo, mount a volume
at `/app/server` if you want it to persist.

## Hosting it publicly (free tier)

Any platform that can run a Dockerfile and give you a public URL works.
Render, Fly.io, and Railway all have free tiers as of this writing:

1. Push this repo to GitHub (already done if you're reading this from there).
2. Create a new "Web Service" (Render) / "app" (Fly.io) / project (Railway)
   pointed at the repo — most of these auto-detect the `Dockerfile`.
3. Set environment variables on the platform's dashboard:
   - `DEMO_MODE=true`
   - `HOST=0.0.0.0` (already the Docker image default, only needed if the
     platform overrides it)
   - `GEMINI_API_KEY=...` (optional, for AI-generated solutions/quizzes)
4. Deploy. First boot will take a bit longer than usual while it seeds the
   demo deck (a dozen or so requests to the judges' public APIs).

None of this requires creating any accounts here in this session — it's a
few clicks on whichever platform you pick.

### Fastest path: Render Blueprint

This repo includes a `render.yaml` at the root, so Render can create and
configure the service for you instead of doing step 2-3 above by hand:

1. Go to https://dashboard.render.com/blueprints and click "New Blueprint
   Instance".
2. Connect your GitHub account (first time only) and pick this repo.
3. Render reads `render.yaml` and pre-fills the service (Docker runtime,
   `DEMO_MODE=true`, `HOST=0.0.0.0`, port 5174) — no fields to fill in.
   Don't add a `GEMINI_API_KEY` yourself here; see "bring-your-own-key"
   above for why.
4. Click "Apply". Render builds the image and gives you a permanent
   `https://<something>.onrender.com` URL — bookmark that instead of
   running the app locally each time.

Free-tier web services on Render spin down after 15 minutes idle and take
~30-60s to wake back up on the next request — expect that cold-start delay
the first time you open the link after a while.

## Known limitation: Codeforces fetching inside a container

`codeforcesClient.js` shells out to `curl` to get past Cloudflare (Node's
own `fetch` and headless Chromium are both blocked there; plain `curl`
isn't, at least from a typical home/dev network). Verified locally by
actually building and running this Dockerfile: from inside a Docker
container, Cloudflare returned `403` to the same `curl` request that works
fine outside the container — almost certainly a network/TLS-fingerprint
difference for traffic coming from cloud/container IP ranges, not something
fixable by installing a different package.

In practice this means the demo seed's two Codeforces problems get silently
skipped when deployed (the seed script already tolerates per-item failures),
leaving a LeetCode + HackerRank demo deck. LeetCode and HackerRank fetching
use plain HTTPS requests and aren't affected. If you deploy this and want
Codeforces problems to actually resolve, you'd need a proxy or a different
fetch strategy for that one client — not something this session could
verify further without an actual hosting account to test against.
