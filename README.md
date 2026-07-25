# KeyProxy — API Key Pool Manager & Rotation Proxy

> Core proxy, key rotation, per-user ownership, the dashboard, and conditional API waterfalls — several different APIs chained behind one endpoint, with run logs, per-provider hit rates, result caching and opt-in parallel fan-out — are all live. See [Running a waterfall](#running-a-waterfall).

Stop your outbound campaigns from dying on rate limits. KeyProxy sits between your automation stack and any upstream API — when one key gets throttled, it instantly rotates to the next. Your campaigns keep running.

Built for cold outbound agencies and operators running at scale.

---

## The problem it solves

You're running AI personalization across 5,000 leads. Your OpenAI key hits its rate limit at lead 800. Everything stops.

Or you have three Apollo accounts, two Hunter.io accounts, and no clean way to load-balance requests across all of them without custom code per integration.

KeyProxy gives you a single endpoint per API. Drop in as many keys as you have. It works through your active keys in order, detects rate limits by HTTP status code, cools down exhausted keys automatically, and retries with the next available key — all without touching your campaign setup.

---

## How it works

```
Your automation tool
        │
        ▼
https://your-keyproxy.vercel.app/api/proxy/CONFIG_ID/...
        │
        ├── Key 1: active   → try → 429 → mark exhausted, cooldown 60min
        ├── Key 2: active   → try → 200 → forward response back to you
        ├── Key 3: cooldown → skip
        └── Key 4: active   → standby
```

One provider per upstream API. Unlimited keys per provider. Unlimited providers.

---

## Features

**Key rotation & rate limit handling**
- Sequential rotation — requests use the lowest-numbered active key, and move to the next one only when it hits a rate limit. (Not round-robin: a pool drains in order rather than spreading load. Under heavy concurrency several requests can therefore land on the same key at once.)
- Configurable rate-limit status codes, restricted to 400–599 (default: 429)
- Automatic cooldown and recovery — exhausted keys re-activate after a window you set
- Up to 200 retry attempts per request before returning 503
- Reset all keys to active instantly from the dashboard

**Dashboard & visibility**
- Real-time active / exhausted / cooldown counts per provider
- Per-key request counts and status
- Audit log — every config change, master-key rotation, key reset, key add/delete, target-host change and webhook delivery is recorded. (Pool rotation itself isn't: benching a rate-limited key happens on the request path and would write a row per throttled call.)
- Request inspector (`/api/debug/...`) showing exactly what was sent and received. **Off unless `ENABLE_DEBUG_ROUTE=true`** — it reflects requests back to the caller, so it's a wiring-up tool, not something to leave on in production. All output is scrubbed of key values.

**Key management**
- Bulk key import — paste a list, duplicates removed automatically
- Add or remove individual keys without downtime
- Master key rotation — generate a new UUID for any provider without touching your key pool

**Auth, teams & isolation**
- One-time setup screen creates the first admin on fresh deploys — no manual DB seeding
- HMAC-signed session cookies, 7-day sessions, no server-side session table
- Multi-user: admins can create accounts, reset passwords, and grant/revoke admin access
- Always keeps at least one admin — can't lock yourself out
- **Every provider has an owner.** You see and manage only your own providers; admins see all. A provider you can't access returns 404 rather than 403, so IDs can't be probed.
- **Upstream API keys never reach the browser.** The dashboard and every API response show a `••••1234` preview; raw key values exist only server-side, on the request path.

**Guardrails**
- Targets must be publicly reachable — loopback, link-local (including the cloud metadata address), RFC1918, CGNAT and `.internal` hosts are refused on save *and* re-checked at request time, since DNS can be repointed afterwards
- Credentials in a target URL are rejected; store them as API keys instead
- Rate-limit codes are restricted to 400–599, so a pool can't be configured to retry its own successes
- Per-attempt timeout on every upstream call, so a hanging API fails fast instead of consuming the whole function budget
- Security headers (CSP, HSTS, nosniff, frame-deny) on the dashboard — deliberately *not* applied to `/api/proxy`, which must pass upstream responses through untouched

**Works with any API**
- Full HTTP passthrough: GET, POST, PUT, PATCH, DELETE
- Forwards the request body, path and query unchanged, and your headers with four groups stripped: hop-by-hop ones (`host`, `connection`, `keep-alive`, `te`, `trailers`, `upgrade`, `transfer-encoding`, `content-length`, `accept-encoding`, `proxy-authenticate`, `proxy-authorization`), the platform's `x-vercel-*` / `x-forwarded-*` headers, KeyProxy's own `x-master-key` / `x-endpoint-key`, and any inbound `Authorization` header — that's where the master key may have arrived, and the provider's auth header is injected from the key pool instead
- Configurable auth header name and prefix per config (e.g. `Authorization: Bearer`, `x-api-key:`, etc.)
- Tested against OpenAI, Anthropic, Apollo, Hunter.io, and generic REST APIs

---

## Waterfalls (shipped)

**Conditional API waterfalls** are live. One endpoint, an ordered list of steps, each calling a *different* upstream API, with rules deciding whether a step runs and whether it resolved the request. Try Prospeo, and if it returns no email try BetterEnrich, then Hunter — one URL, one response shape whichever provider answers, plus a per-provider hit rate telling you which vendor is actually earning its keep. Everything below is built and deployed:

- [x] Per-user ownership and key redaction
- [x] Shared rotation engine with per-attempt timeouts
- [x] Endpoint + version schema, hashed endpoint keys
- [x] Template and condition engine (no `eval`; JSON rule trees)
- [x] Visual step builder
- [x] Public execution endpoint, plus a test run against the unsaved draft
- [x] Run logs and per-provider hit rates
- [x] Result caching keyed on owner + endpoint + version + input
- [x] JSON view of a definition, with import/export
- [x] Opt-in parallel fan-out with declared-order merging

Smaller gaps, all closed:

- [x] Webhook notification when all keys in a pool are simultaneously exhausted — optional per-provider URL, POSTed at most once per 15 minutes (atomic claim in the DB), SSRF-checked at save and again at send
- [x] CSV key import — the add-keys panel imports CSV/TXT files; the key column is detected by header name or value length, and the keys land in the textarea for an explicit Add
- [x] Error monitoring — set `SENTRY_DSN` and unhandled server errors are POSTed to the DSN's envelope endpoint (no SDK, no bundle weight, inert when unset); headers/cookies/bodies/query strings are never sent
- [x] `.env.example` — every variable the app reads, with comments
- [x] Structured logging — one JSON line per event (`login_failed`, `login_succeeded`, `proxy_request`, `exhaustion_webhook`) with allowlisted fields, never secrets
- [x] Session revocation — every page and API route resolves the viewer from the database per request, and gated static files (`/brain/`) get the same check in middleware, so deleting a user locks them out immediately even though their cookie stays cryptographically valid

---

## Quick deploy

**One-click on Vercel:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/athm793/keyproxy)

You need:
1. A [Neon](https://neon.tech) database (free tier works)
2. A random 32-byte hex string for `SESSION_SECRET`

Everything else is optional — see [`.env.example`](.env.example) for the full annotated list (`CRON_SECRET`, `SENTRY_DSN`, proxy timeout tuning). The schema creates itself on first run.

**Self-host:**

```bash
git clone https://github.com/athm793/keyproxy
cd keyproxy
npm install

# Create .env.local
DATABASE_URL=postgresql://...      # Neon connection string (sslmode=require)
SESSION_SECRET=<random 64 hex chars>

npm run dev   # http://localhost:3000
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run the engine tests — templates, conditions, output mapping and request
building. They are pure functions, so this touches no database and spends no
API credits:
```bash
npm test
```

---

## Using the proxy

Replace the base URL of any API call with your KeyProxy endpoint:

```bash
# Before — direct to OpenAI, one key, dies on rate limits
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-abc123..."

# After — routes through KeyProxy, rotates across your key pool
curl https://your-keyproxy.vercel.app/api/proxy/CONFIG_ID/v1/chat/completions \
  -H "x-master-key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [...]}'
```

Your master key authenticates you to KeyProxy. KeyProxy strips it, injects the next available API key, and forwards the request upstream. Your automation tool never touches the underlying keys.

**Alternative — pass the master key as a Bearer token** (useful for tools that only support `Authorization` header):

```bash
curl https://your-keyproxy.vercel.app/api/proxy/CONFIG_ID/v1/models \
  -H "Authorization: Bearer YOUR_MASTER_KEY"
```

---

## Documentation

Full product docs are served by the app itself, publicly:

- **`/docs/`** — setup guide: providers, the proxy, building waterfalls, the run API.
- **`/docs/llm.txt`** — a complete machine-readable spec of the waterfall definition JSON. Paste it into any capable LLM together with your providers' API docs and it can write the whole definition for you — conditions, parallel groups, output mapping, arbitrary complexity. Every example in it is validated against the real save route, and it ends with a ready-made prompt template. Paste the result into the builder's JSON view, which reports every problem with its exact location.

## Running a waterfall

Build the steps under **Endpoints**, then call the one URL:

```bash
curl https://your-keyproxy.vercel.app/api/run/find-email \
  -H "x-endpoint-key: kp_ep_..." \
  -H "Content-Type: application/json" \
  -d '{"domain": "acme.com", "first_name": "Ana"}'
```

You get back the same shape whichever provider answered:

```json
{
  "status": "success",
  "output": { "email": "ana@acme.com", "confidence": 0.94 },
  "raw": { "...": "the winning provider's response, untouched" },
  "resolved_by": "hunter",
  "missing": [],
  "error": null,
  "meta": { "endpoint": "find-email", "version": 4, "duration_ms": 1840,
            "upstream_calls": 2, "cost_cents": 17, "cache_hit": false,
            "run_id": "..." },
  "trace": [
    { "name": "Prospeo", "status": "miss", "http_status": 200, "latency_ms": 612 },
    { "name": "Hunter",  "status": "success", "http_status": 200, "latency_ms": 1180 }
  ]
}
```

`missing` lists required fields still empty, `error` is a human-readable failure reason or `null`. On a cache hit `meta.cache_hit` is `true`, `trace` is empty and `upstream_calls` is `0`; `meta.run_id` is still there, because the cache hit is logged as its own run.

`status` is one of:

| Value | Meaning | HTTP |
|---|---|---|
| `success` | A provider answered and every required field is filled | 200 |
| `partial` | Some fields came back, but not all the required ones | 200 |
| `miss` | Every provider replied, none of them had it | 200 |
| `error` | Something broke — unreachable provider, out of time, hard failure | 502 |

**A miss is a 200, not a 404.** Clay, n8n, Make and Zapier all treat a non-2xx as a failure and will retry the row or halt the table, so "no email found" has to be a successful response that says so. Check `status`, not the HTTP code.

The `trace` explains itself: each step reports whether it ran, why it was skipped, what it returned and how long it took — including which condition failed. That is also how the per-provider hit rate gets computed, so you can see which vendor is actually earning its keep.

A step only counts as an answer if it returns 2xx **and** fills every required output field. A provider returning `200 {"email": null}` has not resolved anything, and the waterfall carries on to the next one.

Endpoint keys are shown once and stored as a SHA-256 hash — a database snapshot doesn't hand anyone a working key. Each key gets its own per-minute run limit, counted in the database, because every run buys real upstream calls.

### Caching and run history

Turn caching on per endpoint and a repeated lookup returns the answer you already bought, at zero upstream calls. The cache key is a hash of **owner + endpoint + definition version + input**, which means:

- One tenant's enriched contact can never be served to another.
- **Editing any step invalidates the cache on its own** — the version is in the key, so there is nothing to remember to purge. The manual purge under Settings is for the other case: the provider's data changed and yours didn't.
- Only `success` and `partial` results are cached. A `miss` isn't: "nobody had this yesterday" shouldn't stop you asking today, since these datasets are exactly what vendors keep adding to. An `error` isn't either — it's a transient condition, and caching it would keep serving a failure long after it cleared.

Run history is written by allowlist: ids, statuses, timings, counts and the condition trace. The caller's input is stored so a row is recognisable; **the result is not, unless you turn on "Save request and response bodies"**. This is contact-enrichment traffic, so logging everything by default would quietly turn a credentials product into a PII store. Retention defaults to 30 days per endpoint and is enforced by the nightly cron.

The Runs tab reports two rates per step, deliberately. **Hit rate** is of the runs where that step actually ran. **Share of answers** is of every run that got an answer at all. Don't compare hit rates between steps — a later step in a waterfall only ever sees the cases everything before it missed, so it is being marked on a harder paper. Share of answers is the number that tells you what you'd lose by dropping a vendor.

---

## Agency setup guide

**One provider = one upstream API.** Here's a typical agency setup:

| Provider name | Target URL | Keys in pool |
|---|---|---|
| OpenAI - Personalization | `https://api.openai.com` | 8 keys across 4 accounts |
| Hunter.io - Email Finder | `https://api.hunter.io` | 3 team keys |
| Apollo - Enrichment | `https://api.apollo.io` | 5 org keys |

Point every tool in your stack at the matching KeyProxy endpoint. Add more keys as you acquire them. The proxy handles the rest.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Long random string for signing session cookies — generate one with the command under [Quick deploy](#quick-deploy). Rotating this logs everyone out. |
| `ENABLE_DEBUG_ROUTE` | No | Set to exactly `true` to enable `/api/debug/...`. Any other value (or unset) leaves the route 404ing — it reflects requests and responses back to the caller. |
| `PROXY_ATTEMPT_TIMEOUT_MS` | No | Per-attempt upstream timeout. Defaults to `30000`. Raise it if a provider is legitimately slow. |
| `CRON_SECRET` | No | Authorises the nightly cleanup at `/api/cron/prune`. Vercel sets this for you when you add it as a project env var. **Without it the route rejects everything** — run history and cache rows are then never pruned, so set it. |
| `SENTRY_DSN` | No | A standard Sentry DSN. Unhandled server errors are POSTed to its envelope endpoint (no SDK, no bundle weight, inert when unset); headers, cookies, bodies and query strings are never sent. |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | No | The app's own public URL, used to stop a provider target or webhook pointing back at KeyProxy itself. Only needed where the platform doesn't supply it — Vercel sets `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` automatically. Both names are read; set either. |

---

## First login

Fresh deploy → visit the app → you're redirected to `/setup`. Create your admin account. That's it — no manual DB steps, no seed scripts. Subsequent team members get accounts from the **Manage Users** screen (admin only).

---

## API reference

| Method | Route | Description |
|---|---|---|
| GET / POST | `/api/configs` | List (scoped to the caller) or create providers |
| GET / PATCH / DELETE | `/api/configs/[id]` | Get, update, or delete a provider |
| GET | `/api/configs/[id]/keys` | List keys — **previews only**, never raw values |
| POST | `/api/configs/[id]/keys` | Add keys to a provider |
| DELETE | `/api/configs/[id]/keys/[keyId]` | Remove a specific key |
| POST | `/api/configs/[id]/reset` | Reset all keys to active |
| POST | `/api/configs/[id]/rotate-key` | Rotate the config's master key |
| POST | `/api/configs/[id]/test` | Test connectivity to the target API |
| ALL | `/api/proxy/[configId]/[...path]` | Main proxy endpoint |
| POST | `/api/debug/[configId]/[...path]` | Debug proxy with verbose logging. 404s unless `ENABLE_DEBUG_ROUTE=true` |
| GET / POST | `/api/endpoints` | List or create waterfall endpoints |
| GET / PATCH / DELETE | `/api/endpoints/[id]` | Get, update settings, or delete |
| PUT | `/api/endpoints/[id]/definition` | Save a new version of the waterfall |
| GET / POST | `/api/endpoints/[id]/versions` | List saved versions, or restore one (copied forward as a new version) |
| GET / POST | `/api/endpoints/[id]/keys` | List or issue endpoint keys |
| DELETE | `/api/endpoints/[id]/keys/[keyId]` | Revoke an endpoint key |
| POST | `/api/endpoints/[id]/test` | Run an unsaved draft; nothing is persisted |
| GET / DELETE | `/api/endpoints/[id]/cache` | Count or clear cached answers |
| POST | `/api/run/[slug]` | **Run a waterfall.** Authenticated by `x-endpoint-key` |
| GET | `/api/cron/prune` | Nightly cleanup. Gated on `CRON_SECRET`, fail-closed |
| GET | `/api/health` | Health check |
| POST | `/api/auth/setup` | One-time: create first admin |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/auth/me` | Current session user |
| GET / POST | `/api/users` | List or create users (admin only) |
| PATCH / DELETE | `/api/users/[id]` | Update or delete a user (admin only) |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript 5 |
| Database | Neon (PostgreSQL serverless) |
| DB client | `@neondatabase/serverless` |
| Session auth | HMAC-signed cookie, scrypt passwords |
| Deployment | Vercel |

---

## Database schema

Proxy side:

**proxy_configs** — `id, name, target_base_url, auth_header_name, auth_header_prefix, rate_limit_codes[], cooldown_minutes, master_key, owner_user_id, webhook_url, created_at`

On first run after upgrading, `owner_user_id` is added and any existing providers are adopted by the oldest admin account, so nobody is locked out of their own key pools. `webhook_url` is the optional pool-exhaustion webhook.

**api_keys** — `id, config_id, key_value, order_index, status (active|exhausted|cooldown), exhausted_at, request_count, created_at`

**audit_log** — `id, config_id, action, detail, created_at`

**users** — `id, email, password_hash, name, is_admin, created_at, updated_at`

Endpoint (waterfall) side:

**endpoints** — `id, name, slug, description, owner_user_id, active_version_id, revision, enabled, cache_enabled, cache_ttl_seconds, run_deadline_ms, rate_limit_per_minute, log_retention_days, log_bodies, created_at, updated_at`

**endpoint_versions** — `id, endpoint_id, version_no, definition (JSONB), note, created_at`. Immutable: every save appends, restores copy forward.

**endpoint_keys** — `id, endpoint_id, key_id, key_hash, label, last_used_at, revoked_at, created_at`. Only the SHA-256 hash is stored.

**endpoint_runs** — `id, endpoint_id, version_id, status, resolved_by, cache_hit, upstream_calls, cost_cents, duration_ms, input, output, error, created_at`. `output` is written only when the endpoint has body logging on.

**endpoint_run_steps** — `id, run_id, step_key, step_index, group_id, config_id, config_name, status, skip_reason, http_status, latency_ms, attempts, keys_exhausted, cost_cents, trace, created_at`. `config_id` is deliberately not a foreign key, so deleting a provider doesn't erase its history.

**endpoint_cache** — `cache_key, endpoint_id, version_id, result, run_id, hit_count, expires_at, created_at`. The key hashes owner + endpoint + version + input.

**endpoint_rate_counters** — `key_record_id, window_start, count`. Per-key per-minute run limit, counted in the database so it holds across instances.

The endpoint tables are created behind a Postgres advisory lock, because `CREATE TABLE IF NOT EXISTS` is not race-free across two concurrent cold starts.

---

## Architecture

```
src/
├── middleware.ts                             # Session-cookie auth gate
├── instrumentation.ts                        # onRequestError → Sentry envelope
├── app/
│   ├── page.tsx                              # Dashboard — all configs
│   ├── login/page.tsx                        # Login
│   ├── setup/page.tsx                        # First-run admin setup
│   ├── admin/users/page.tsx                  # User management (admin)
│   ├── configs/new/page.tsx                  # Create config
│   ├── configs/[id]/page.tsx                 # Manage keys + settings
│   ├── endpoints/page.tsx                    # Waterfall endpoints list
│   ├── endpoints/new/page.tsx                # Create endpoint
│   ├── endpoints/[id]/page.tsx               # Build tab (visual + JSON)
│   ├── endpoints/[id]/runs/                  # Run list + run detail
│   ├── endpoints/[id]/settings/page.tsx      # Settings, keys, versions, cache
│   └── api/
│       ├── proxy/[configId]/[...path]/       # Main proxy endpoint
│       ├── debug/[configId]/[...path]/       # Debug proxy
│       ├── configs/                          # Config CRUD, keys, reset, rotate, test
│       ├── endpoints/                        # Endpoint CRUD, definition, versions,
│       │                                     #   keys, test run, cache
│       ├── run/[endpointId]/                 # Public waterfall execution
│       ├── cron/prune/                       # Nightly retention + cache cleanup
│       ├── auth/                             # login, logout, me, setup
│       ├── users/                            # User management
│       └── health/                           # Health check
├── components/
│   ├── ConfigCard.tsx, KeysTable.tsx, AddKeysForm.tsx, EditConfigForm.tsx,
│   │   MasterKeyDisplay.tsx, CurlExample.tsx, StatsBar.tsx, AuditLog.tsx,
│   │   TestConnectionButton.tsx              # Provider surfaces
│   ├── EndpointsTable.tsx, EndpointUrlBar.tsx, EndpointKeysManager.tsx,
│   │   EndpointSettingsForm.tsx, EndpointDangerZone.tsx, VersionHistory.tsx,
│   │   CachePanel.tsx, RunsTable.tsx, RunStatusFilter.tsx,
│   │   ProviderPerformance.tsx               # Endpoint surfaces
│   ├── LoginForm.tsx, SetupForm.tsx, UserMenu.tsx, UsersManager.tsx,
│   │   HeaderNav.tsx, ConfirmModal.tsx       # Auth, users, chrome
│   ├── builder/                              # Visual step builder: EndpointBuilder,
│   │                                         #   StepCard, ConditionEditor, MappingTable,
│   │                                         #   TokenInput, JsonView, TestRunPanel…
│   └── ui/                                   # Shared primitives: Select, Field,
│                                             #   Icon, Toggle, Tabs, Pagination,
│                                             #   StatTile, CodeBlock, Skeleton,
│                                             #   Popover, TooltipLayer, SortableTh…
└── lib/
    ├── db.ts                                 # Neon DB + schema init
    ├── usersDb.ts                            # User CRUD
    ├── auth.ts                               # Session cookies + authorizeConfig
    ├── sessionToken.ts                       # Edge-safe HMAC tokens
    ├── passwords.ts                          # scrypt hashing
    ├── rotation.ts                           # Key-rotation engine
    ├── proxy.ts                              # Pass-through adapter over rotation
    ├── runner.ts                             # Rotation adapter the executor calls
    ├── exhaustionWebhook.ts                  # Pool-exhausted notification
    ├── rateLimit.ts                          # In-process limiter for the dashboard
    ├── validation.ts                         # URL/egress guards
    ├── redact.ts                             # Secret scrubbing
    ├── log.ts                                # Structured one-line JSON events
    ├── endpointSchema.sql.ts                 # Endpoint-side DDL (advisory-locked)
    ├── endpointsDb.ts                        # Endpoint + version CRUD
    ├── endpointKeys.ts                       # Issue/verify hashed endpoint keys
    ├── endpointKeyFormat.ts                  # kp_ep_<id>_<secret> parsing
    ├── endpointGuards.ts                     # Ownership + access checks
    ├── endpointTypes.ts                      # Definition/endpoint interfaces
    ├── runLog.ts                             # Allowlisted run + step history
    ├── runCache.ts                           # Result cache read/write/prune
    ├── runAnalytics.ts                       # Hit rate, share of answers, cost
    ├── runStatus.ts                          # Status lifecycle helpers
    ├── slug.ts                               # Endpoint slug rules
    ├── format.ts                             # Shared display formatting
    ├── engine/                               # Pure, DB-free waterfall engine:
    │                                         #   template, paths, rules, mapping,
    │                                         #   request, execute, validate,
    │                                         #   cacheKey, input, tokens, describe
    ├── ui.ts                                 # Shared class strings
    └── types.ts                              # TypeScript interfaces
```

**Rotation logic:** pick lowest `order_index` active key → forward request → if the response code is in `rate_limit_codes`, mark that key exhausted, exclude it for the rest of this request, and retry with the next → return 503 only when every key is simultaneously exhausted. Each attempt has its own timeout, and the whole loop respects an optional deadline.

`rotation.ts` returns the upstream response **unconsumed** along with which key was used, how many attempts it took, and how many keys were burned. That is what lets the pass-through proxy stream the body straight back while the waterfall executor reads and inspects it.
