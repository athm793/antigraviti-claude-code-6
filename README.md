# KeyProxy — API Key Pool Manager & Rotation Proxy

> **Work in progress.** Core proxy, key rotation, and dashboard are production-ready. See [Planned](#planned) for what's coming next.

Stop your outbound campaigns from dying on rate limits. KeyProxy sits between your automation stack and any upstream API — when one key gets throttled, it instantly rotates to the next. Your campaigns keep running.

Built for cold outbound agencies and operators running at scale.

---

## The problem it solves

You're running AI personalization across 5,000 leads. Your OpenAI key hits its rate limit at lead 800. Everything stops.

Or you have three Apollo accounts, two Hunter.io accounts, and no clean way to load-balance requests across all of them without custom code per integration.

KeyProxy gives you a single endpoint per API. Drop in as many keys as you have. It round-robins through active keys, detects rate limits by HTTP status code, cools down exhausted keys automatically, and retries with the next available key — all without touching your campaign setup.

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

One config per upstream API. Unlimited keys per config. Unlimited configs.

---

## Features

**Key rotation & rate limit handling**
- Round-robin rotation across all active keys
- Configurable rate-limit status codes (default: 429)
- Automatic cooldown and recovery — exhausted keys re-activate after a window you set
- Up to 200 retry attempts per request before returning 503
- Reset all keys to active instantly from the dashboard

**Dashboard & visibility**
- Real-time active / exhausted / cooldown counts per config
- Per-key request counts and status
- Audit log — every rotation, reset, and key change is recorded
- Debug endpoint (`/api/debug/...`) for inspecting proxy behavior without affecting production

**Key management**
- Bulk key import — paste a list, duplicates removed automatically
- Add or remove individual keys without downtime
- Master key rotation — generate a new UUID for any config without touching your key pool

**Auth & teams**
- One-time setup screen creates the first admin on fresh deploys — no manual DB seeding
- HMAC-signed session cookies, 7-day sessions, no server-side session table
- Multi-user: admins can create accounts, reset passwords, and grant/revoke admin access
- Always keeps at least one admin — can't lock yourself out

**Works with any API**
- Full HTTP passthrough: GET, POST, PUT, PATCH, DELETE
- Forwards all headers and request body unchanged
- Configurable auth header name and prefix per config (e.g. `Authorization: Bearer`, `x-api-key:`, etc.)
- Tested against OpenAI, Anthropic, Apollo, Hunter.io, and generic REST APIs

---

## Planned

These are confirmed gaps being actively worked on — not wishlist items:

- [ ] Webhook notification when all keys in a pool are simultaneously exhausted
- [ ] Per-key usage analytics with time-series charts
- [ ] CSV key import
- [ ] Per-config request logs with filtering and pagination
- [ ] Sentry / error monitoring integration
- [ ] `.env.example` file for easier self-hosting
- [ ] Structured logging in auth and proxy handlers
- [ ] Extract shared form styles to a single module (current duplication across 5 components)

---

## Quick deploy

**One-click on Vercel:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/athm793/keyproxy)

You need:
1. A [Neon](https://neon.tech) database (free tier works)
2. A random 32-byte hex string for `SESSION_SECRET`

The schema creates itself on first run.

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

## Agency setup guide

**One config = one upstream API.** Here's a typical agency setup:

| Config name | Target URL | Keys in pool |
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
| `SESSION_SECRET` | Yes | 32+ byte random hex string for signing session cookies. Rotating this logs everyone out. |

---

## First login

Fresh deploy → visit the app → you're redirected to `/setup`. Create your admin account. That's it — no manual DB steps, no seed scripts. Subsequent team members get accounts from the **Manage Users** screen (admin only).

---

## API reference

| Method | Route | Description |
|---|---|---|
| GET / POST | `/api/configs` | List or create proxy configs |
| GET / PATCH / DELETE | `/api/configs/[id]` | Get, update, or delete a config |
| POST | `/api/configs/[id]/keys` | Add keys to a config |
| DELETE | `/api/configs/[id]/keys/[keyId]` | Remove a specific key |
| POST | `/api/configs/[id]/reset` | Reset all keys to active |
| POST | `/api/configs/[id]/rotate-key` | Rotate the config's master key |
| POST | `/api/configs/[id]/test` | Test connectivity to the target API |
| ALL | `/api/proxy/[configId]/[...path]` | Main proxy endpoint |
| ALL | `/api/debug/[configId]/[...path]` | Debug proxy with verbose logging |
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

**proxy_configs** — `id, name, target_base_url, auth_header_name, auth_header_prefix, rate_limit_codes[], cooldown_minutes, master_key, created_at`

**api_keys** — `id, config_id, key_value, order_index, status (active|exhausted|cooldown), exhausted_at, request_count, created_at`

**audit_log** — `id, config_id, action, detail, created_at`

**users** — `id, email, password_hash, name, is_admin, created_at, updated_at`

---

## Architecture

```
src/
├── middleware.ts                             # Session-cookie auth gate
├── app/
│   ├── page.tsx                              # Dashboard — all configs
│   ├── login/page.tsx                        # Login
│   ├── setup/page.tsx                        # First-run admin setup
│   ├── admin/users/page.tsx                  # User management (admin)
│   ├── configs/new/page.tsx                  # Create config
│   ├── configs/[id]/page.tsx                 # Manage keys + settings
│   └── api/
│       ├── proxy/[configId]/[...path]/       # Main proxy endpoint
│       ├── debug/[configId]/[...path]/       # Debug proxy
│       ├── configs/                          # Config CRUD
│       ├── auth/                             # login, logout, me, setup
│       ├── users/                            # User management
│       └── health/                           # Health check
├── components/
│   ├── ConfigCard.tsx
│   ├── KeysTable.tsx
│   ├── AddKeysForm.tsx
│   ├── EditConfigForm.tsx
│   ├── MasterKeyDisplay.tsx
│   ├── CurlExample.tsx
│   ├── StatsBar.tsx
│   ├── AuditLog.tsx
│   ├── LoginForm.tsx
│   ├── SetupForm.tsx
│   ├── UserMenu.tsx
│   └── UsersManager.tsx
└── lib/
    ├── db.ts                                 # Neon DB + schema init
    ├── usersDb.ts                            # User CRUD
    ├── auth.ts                               # Session cookie helpers
    ├── sessionToken.ts                       # Edge-safe HMAC tokens
    ├── passwords.ts                          # scrypt hashing
    ├── proxy.ts                              # Key rotation + forwarding
    └── types.ts                              # TypeScript interfaces
```

**Rotation logic:** pick lowest `order_index` active key → forward request → if response code is in `rate_limit_codes`, mark exhausted, schedule cooldown recovery, retry with next key → return 503 only if all keys are simultaneously exhausted.
