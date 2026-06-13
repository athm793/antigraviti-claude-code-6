# KeyProxy — API Key Pool Manager & Proxy

A full-stack proxy server that manages pools of API keys and automatically rotates through them when rate limits are hit. Create proxy configs targeting any API, add your keys, and route all traffic through KeyProxy — exhausted keys are automatically cooled down and recovered.

## Features

- **Key rotation** — automatically cycles through active keys in round-robin order
- **Rate limit detection** — configurable HTTP status codes (default: 429) trigger key exhaustion
- **Cooldown & recovery** — exhausted keys auto-recover after a configurable cooldown window
- **Master key auth** — each proxy config has a unique UUID master key for client authentication
- **Full HTTP passthrough** — supports GET, POST, PUT, PATCH, DELETE; forwards all headers and body
- **Multi-config** — unlimited proxy configs, each targeting a different upstream API
- **Request counting** — tracks total requests served per key
- **Real-time dashboard** — see active / exhausted / cooldown counts per config
- **Bulk key import** — paste multiple keys at once; duplicates are auto-removed
- **Debug endpoint** — `/api/debug/[configId]/[...path]` for inspecting proxy behavior

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript 5 |
| Database | Neon (PostgreSQL serverless) |
| DB client | `@neondatabase/serverless` |
| ID generation | `uuid` v11 |
| Deployment | Vercel |

## Getting Started

```bash
npm install

# Add your Neon connection string
echo "DATABASE_URL=postgresql://..." > .env.local

npm run dev       # http://localhost:3000
npm run build
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string (with `sslmode=require`) |
| `SESSION_SECRET` | ✅ | Random secret used to sign login session cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Changing it logs everyone out. |

Get a free database at [neon.tech](https://neon.tech). The schema is auto-created on first run.

## Authentication

KeyProxy is a private dashboard — every page and `/api/configs*` / `/api/users*`
route requires a logged-in session (the proxy endpoints `/api/proxy/*` and
`/api/debug/*` are unaffected and keep using per-config master keys).

- **First run:** with zero accounts in the database, visiting the app redirects
  to `/setup`, a one-time screen that creates the first user. That user is
  automatically an **admin**.
- **Logging in:** subsequent visits go to `/login`. Sessions last 7 days and
  are stored in an HTTP-only `kp_session` cookie (HMAC-signed, no server-side
  session table).
- **Roles:** every account can view and manage all proxy configs — there are
  no per-config permissions. The only distinction is `is_admin`, which adds
  access to **Manage Users** (`/admin/users`) for creating accounts, resetting
  passwords, and granting/revoking admin access. KeyProxy always keeps at
  least one admin.

## Proxy Usage

Route any API call through KeyProxy by replacing the target base URL with your proxy endpoint:

```bash
# Via x-master-key header
curl -X POST https://your-keyproxy.vercel.app/api/proxy/CONFIG_ID/v1/chat/completions \
  -H "x-master-key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'

# Via Authorization header
curl -X GET https://your-keyproxy.vercel.app/api/proxy/CONFIG_ID/v1/models \
  -H "Authorization: Bearer YOUR_MASTER_KEY"
```

KeyProxy strips the master key, injects the next available API key, and forwards the request to your configured target URL.

## API Routes

| Method | Route | Description |
|---|---|---|
| GET / POST | `/api/configs` | List or create proxy configs |
| GET / PATCH / DELETE | `/api/configs/[id]` | Get, update, or delete a config |
| POST | `/api/configs/[id]/keys` | Add keys to a config |
| DELETE | `/api/configs/[id]/keys/[keyId]` | Remove a specific key |
| POST | `/api/configs/[id]/reset` | Reset all keys to active status |
| POST | `/api/configs/[id]/rotate-key` | Rotate a config's master key |
| POST | `/api/configs/[id]/test` | Test connectivity to the target API |
| ALL | `/api/proxy/[configId]/[...path]` | Main proxy endpoint |
| ALL | `/api/debug/[configId]/[...path]` | Debug proxy with logging |
| GET | `/api/health` | Health check |
| POST | `/api/auth/setup` | One-time: create the first admin account |
| POST | `/api/auth/login` | Log in, sets the session cookie |
| POST | `/api/auth/logout` | Log out, clears the session cookie |
| GET | `/api/auth/me` | Get the current logged-in user |
| GET / POST | `/api/users` | List or create users (admin only) |
| PATCH / DELETE | `/api/users/[id]` | Update or delete a user (admin only) |

## Database Schema

**proxy_configs** — `id, name, target_base_url, auth_header_name, auth_header_prefix, rate_limit_codes[], cooldown_minutes, master_key, created_at`

**api_keys** — `id, config_id, key_value, order_index, status (active|exhausted|cooldown), exhausted_at, request_count, created_at`

**audit_log** — `id, config_id, action, detail, created_at`

**users** — `id, email, password_hash, name, is_admin, created_at, updated_at`

## Architecture

```
src/
├── middleware.ts                             # Session-cookie auth gate
├── app/
│   ├── page.tsx                              # Dashboard — list all configs
│   ├── login/page.tsx                        # Login form
│   ├── setup/page.tsx                        # One-time first-admin setup
│   ├── admin/users/page.tsx                  # Manage users (admin only)
│   ├── configs/new/page.tsx                  # Create config form
│   ├── configs/[id]/page.tsx                 # Manage keys + settings
│   └── api/
│       ├── proxy/[configId]/[...path]/       # Main proxy endpoint
│       ├── debug/[configId]/[...path]/       # Debug proxy
│       ├── configs/                          # Config CRUD
│       ├── auth/                             # login, logout, me, setup
│       ├── users/                            # User management (admin only)
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
    ├── db.ts                                 # Neon DB operations + schema init
    ├── usersDb.ts                            # User CRUD
    ├── auth.ts                               # Session cookie helpers (Node runtime)
    ├── sessionToken.ts                       # Edge-safe HMAC session tokens
    ├── passwords.ts                          # scrypt password hashing
    ├── proxy.ts                              # Key rotation + request forwarding
    └── types.ts                              # TypeScript interfaces
```

**Rotation logic:** select active key with lowest `order_index` → forward request → if response code matches a configured rate-limit code, mark key as exhausted → retry with next key (max 200 attempts) → return 503 if all keys are exhausted.
