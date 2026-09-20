# TRINETRA OS — The Third Eye of Investigation

Full-stack investigation workstation: VPN-gated auth, graph analytics,
Sec 172/173 proceedings, staging pipeline, SAHAYAK AI, cyber cell.

> **Why TRINETRA?** Trinetra is the third eye of Shiva — the eye that sees
> through illusion (*maya*) to truth. An investigation runs on three eyes:
> **human intelligence** (field officers), **technical intelligence**
> (forensic + cyber), and **synthesis** (SAHAYAK AI joining them into one
> picture). Motto: *तमसो मा ज्योतिर्गमय* — from darkness, lead me to light.

## Run Locally

**Prerequisites:** Node.js 22+, optional MongoDB 7+ and Ollama.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set values (LLM provider, VPN gateway).
3. Run the app: `npm run dev` (serves API + UI on http://localhost:3000)

Without `MONGO_URL` the server uses the in-memory vault (data resets on
restart). Set `MONGO_URL=mongodb://127.0.0.1:27017` + `MONGO_DB=crimintel`
for durable storage — the vault seeds itself on first connect.

## Verify

- `npm run lint` — typecheck
- `npm run build` — production bundles (`dist/`)
- `npm run test:integration` — 58 live API assertions (needs a running server)
- `npm run test:output` — PDF/XML artifact assertions (no server needed)
- `npm run test:eval` — 13-case SAHAYAK quality eval (needs server + model)

## Production (Docker)

```bash
docker build -t trinetra-os .
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET='<unique-256-bit-secret>' \
  -e CCTNS_DEMO_MODE=false \
  -e MONGO_URL='mongodb://mongo:27017' \
  -e MONGO_DB=crimintel \
  trinetra-os
```

Production boot refuses unsafe defaults: a unique `JWT_SECRET` is
mandatory and `CCTNS_DEMO_MODE=false` is required (override only with
`ALLOW_DEMO_IN_PROD=true`). Auth/VPN endpoints are rate-limited, and
`/api/health` reports `backend: mongodb|memory`. (Helmet CSP removed —
it blocked legitimate traffic; re-add after staging allow-list tests.)
