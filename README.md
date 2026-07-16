# release-tracker

Cricket live-score API + webhook backend. Polls a free public cricket API on a schedule,
stores match summaries in Postgres, serves them to the `performance-dashboard` frontend,
and fires HMAC-signed outgoing webhooks to subscribers whenever a match's score changes.

> **Note on "webhooks"**: the free cricket API is pull-only — it can't push data to us.
> So this service polls it on a timer, and *we* implement the webhook layer on top: anyone
> can `POST /api/webhooks/subscribe` with a URL, and we'll call that URL whenever a
> subscribed match's score changes.

## 1. Get a free CricAPI key

1. Go to https://www.cricapi.com/ (or https://cricketdata.org/, same product) and sign up — no card required.
2. Copy your API key from the dashboard.
3. Free "Lifetime Free" plan = 100 requests/day. This service is designed to stay well
   under that: it polls the match list every `POLL_INTERVAL_MINUTES` (default 20 = ~72
   calls/day) and only fetches full per-match detail on demand, cached for
   `MATCH_DETAIL_TTL_MINUTES` (default 3).

## 2. Set up a free Postgres database (Supabase)

1. Create a free account at https://supabase.com and click "New project".
2. Once it's provisioned, go to **Project Settings → Database → Connection string** and
   copy the **Session pooler** string, not the direct connection. Supabase's direct
   connection is IPv6-only on new projects, and most free hosts (including Render) can't
   reach it — the session pooler is IPv4-compatible and works everywhere.
3. It looks like `postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres`.
   If your password has special characters (`@ : / #` etc.), percent-encode them.
4. Free tier notes: 500MB storage cap, project auto-pauses after 7 days with no activity
   (just open the dashboard to resume it), no automatic backups. Fine for learning, not for
   anything you can't afford to lose.

## 3. Configure environment

```
cp .env.example .env
```

Fill in `CRICKET_API_KEY` and `DATABASE_URL` from steps 1–2.

## 4. Install, migrate, run

```
npm install
npm run db:migrate   # applies src/db/schema.sql to DATABASE_URL
npm run dev           # starts the API on http://localhost:4000
```

Verify:
```
curl http://localhost:4000/api/health
curl http://localhost:4000/api/matches
```

The first request may return an empty list until the first poll cycle completes (runs
immediately on boot, then every `POLL_INTERVAL_MINUTES`).

## API reference

| Method | Path                          | Description                                                        |
|--------|-------------------------------|----------------------------------------------------------------------|
| GET    | `/api/health`                 | Liveness check                                                       |
| GET    | `/api/matches?status=live`    | List matches, optional `status` filter: `live`, `completed`, `upcoming` |
| GET    | `/api/matches/:id`            | Single match detail (auto-refreshes from upstream if stale & live)     |
| POST   | `/api/webhooks/subscribe`     | `{ url, matchId? }` → `{ id, secret }`. Omit `matchId` to get all matches. |
| DELETE | `/api/webhooks/subscribe/:id` | Unsubscribe                                                            |
| POST   | `/api/webhooks/test`          | `{ subscriberId }` → sends one test payload to that subscriber          |
| GET    | `/api/matches/:id/summary`    | 2-sentence Claude summary of the match, following the `match-summary` skill (`src/skills`) |
| POST   | `/api/assistant/chat`         | `{ message }` → `{ reply, toolCalls }`. Claude answers using tools executed by our own MCP server at `/mcp` |
| POST   | `/mcp`                        | This app's own MCP server (`list_matches`, `get_match`) over Streamable HTTP — point Claude Desktop/Code or any MCP client at it |

`/api/matches/:id/summary` and `/api/assistant/chat` require `ANTHROPIC_API_KEY` to be set.

### Verifying webhook deliveries

Every delivery includes an `X-Signature: sha256=<hex>` header — an HMAC-SHA256 of the raw
JSON body using the `secret` you got back from `/subscribe`. Recompute it on your receiving
end and compare to confirm the payload really came from this service.

Quick manual test: grab a throwaway URL from https://webhook.site, then:
```
curl -X POST http://localhost:4000/api/webhooks/subscribe -H "Content-Type: application/json" \
  -d '{"url": "https://webhook.site/your-id"}'
# -> { "id": "...", "secret": "..." }
curl -X POST http://localhost:4000/api/webhooks/test -H "Content-Type: application/json" \
  -d '{"subscriberId": "the id from above"}'
```

## Running with Docker

```
docker build -t release-tracker .
docker run --env-file .env -p 4000:4000 release-tracker
```

Or, for a fully offline dev loop with a local Postgres instead of Supabase:
```
docker compose up --build
```
(`docker-compose.yml` spins up Postgres + the API together; set `CRICKET_API_KEY` in your
shell or a `.env` file next to it — Compose reads `.env` automatically for variable
substitution.)

## Deploying to Render (free tier)

1. Push this repo to GitHub.
2. On https://render.com: **New → Web Service**, connect the repo. Render auto-detects the
   `Dockerfile` and offers "Docker" as the runtime.
3. Set environment variables in the Render dashboard: `CRICKET_API_KEY`, `DATABASE_URL`
   (your Supabase string), `CORS_ORIGINS` (your frontend's Render URL, added once you have it), `PORT=4000`,
   and `ANTHROPIC_API_KEY` (needed for `/api/matches/:id/summary` and `/api/assistant/chat`).
4. Choose the **Free** instance type. No card required.
5. Note: free Render web services sleep after 15 minutes of no traffic and take about a
   minute to wake back up on the next request — expected behavior, not a bug, and totally
   fine for "delays are OK" live scores.

## Appendix: AWS free tier, if you want to explore it

AWS **ECS Fargate has no real free tier** — Fargate compute is billed from the first second,
with no "12 months free" or "always free" allowance. The only genuinely free AWS compute for
containers is a plain **EC2 t2.micro/t3.micro instance** (750 hours/month, for 12 months,
new accounts only) running Docker directly (`docker run ...`), or an **ECS cluster using the
EC2 launch type** pointed at that same free-tier instance (ECS itself is free; the EC2
instance it manages is what's covered by the free tier). Amazon ECR (image registry) has an
always-free 500MB/month tier for storing your images. This path expires after 12 months and
then bills normally — Render (above) is the option that doesn't expire, so treat this as an
educational side-quest rather than the primary deployment.
