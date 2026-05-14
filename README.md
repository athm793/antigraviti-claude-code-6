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

Get a free database at [neon.tech](https://neon.tech). The schema is auto-created on first run.

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
| ALL | `/api/proxy/[configId]/[...path]` | Main proxy endpoint |
| ALL | `/api/debug/[configId]/[...path]` | Debug proxy with logging |
| GET | `/api/health` | Health check |

## Database Schema

**proxy_configs** — `id, name, target_base_url, auth_header_name, auth_header_prefix, rate_limit_codes[], cooldown_minutes, master_key, created_at`

**api_keys** — `id, config_id, key_value, order_index, status (active|exhausted|cooldown), exhausted_at, request_count, created_at`

## Architecture

```
src/
├── app/
│   ├── page.tsx                              # Dashboard — list all configs
│   ├── configs/new/page.tsx                  # Create config form
│   ├── configs/[id]/page.tsx                 # Manage keys + settings
│   └── api/
│       ├── proxy/[configId]/[...path]/       # Main proxy endpoint
│       ├── debug/[configId]/[...path]/       # Debug proxy
│       ├── configs/                          # Config CRUD
│       └── health/                           # Health check
├── components/
│   ├── ConfigCard.tsx
│   ├── KeysTable.tsx
│   ├── AddKeysForm.tsx
│   ├── EditConfigForm.tsx
│   ├── MasterKeyDisplay.tsx
│   ├── CurlExample.tsx
│   └── StatsBar.tsx
└── lib/
    ├── db.ts                                 # Neon DB operations + schema init
    ├── proxy.ts                              # Key rotation + request forwarding
    └── types.ts                              # TypeScript interfaces
```

**Rotation logic:** select active key with lowest `order_index` → forward request → if response code matches a configured rate-limit code, mark key as exhausted → retry with next key (max 200 attempts) → return 503 if all keys are exhausted.
