# TRINETRA OS - The Third Eye of Investigation

> *तमसो मा ज्योतिर्गमय* — from darkness, lead me to light.

**Live app:** https://trinetraai-xi.vercel.app
**Backend API:** https://trinetra-8ejj.onrender.com ([health](https://trinetra-8ejj.onrender.com/healthz))

Full-stack investigation workstation for law-enforcement teams: VPN-gated
officer auth, crime-graph analytics with centrality metrics, Sec 172/173
BNSS proceedings, evidence staging pipeline, SAHAYAK AI briefs, and a
cyber-intel cell.

> **Why TRINETRA?** Trinetra is the third eye of Shiva — the eye that sees
> through illusion (*maya*) to truth. An investigation runs on three eyes:
> **human intelligence** (field officers), **technical intelligence**
> (forensic + cyber), and **synthesis** (SAHAYAK AI joining them into one
> picture).

## Try it in 60 seconds

1. Open the **live app** above — you'll land on the VPN gateway.
2. Click **Connect Tunnel** and copy the **6-digit OTP** shown on screen.
3. On Officer Sign-In, use any demo account below (email or badge ID +
   password + the tunnel OTP).

### Demo accounts

| Role | Name | Login (email / badge) | Password |
|---|---|---|---|
| CBI Admin | DG Meenakshi Rao, IPS | `admin@cbi.gov.in` / `CBI-ADM-001` | `Admin@123` |
| Lead IO (Maharashtra) | PI Devendra Patil | `patil@mahapolice.gov.in` / `MHA-LEAD-502` | `Lead@123` |
| Lead IO (NIA) | SP Farhan Qureshi, IPS | `qureshi@nia.gov.in` / `NIA-LEAD-118` | `Lead@123` |
| Cyber Cell (Maharashtra) | API Sneha Kulkarni | `cyber@mahapolice.gov.in` / `MHA-CYB-601` | `Agency@123` |
| Forensics (Maharashtra) | Dr. Milind Pawar | `fsl@mahapolice.gov.in` / `MHA-FSL-602` | `Forensic@123` |
| Field (Maharashtra) | PC Ramesh Gite | `gite@mahapolice.gov.in` / `MHA-FLD-701` | `Officer@123` |

Password pattern across all 40 seeded officers: Admins `Admin@123`,
Leads `Lead@123`, Forensics `Forensic@123`, Cyber/Field `Agency@123`
(MH/KA field constables `Officer@123`). The sign-in screen also offers
1-click demo profiles. Every login additionally requires the tunnel OTP
from step 2 (wrong OTP 5x locks the account pending Admin reactivation).

## Run locally

**Prerequisites:** Node.js 22+, optional MongoDB 7+ and Ollama.

```bash
npm install
cp .env.example .env   # set LLM provider, VPN gateway, secrets
npm run dev            # API + UI on http://localhost:3000
```

Without `MONGO_URL` the server uses the in-memory vault (data resets on
restart). Set `MONGO_URL=mongodb://127.0.0.1:27017` + `MONGO_DB=crimintel`
for durable storage — the vault seeds itself (officers + demo cases) on
first connect.

## Deploy (Vercel frontend + Render backend)

**Render (backend)** — New → Web Service (or Blueprint via `render.yaml`):
build `npm ci && npm run build`, start `node dist/server.cjs`, health
check `/healthz`. Env: `NODE_ENV=production`, `SKIP_STATIC=true`,
`CCTNS_DEMO_MODE=false`, `JWT_SECRET` (unique, required),
`MONGO_URL`, `MONGO_DB`, `FRONTEND_URL=https://<your-app>.vercel.app`,
`LLM_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-120b`.

**Vercel (frontend)** — import the repo (Framework: Vite, build
`npm run build:client`, output `dist`). Env (plain, Production +
Preview): `VITE_API_URL=https://<your-render-service>.onrender.com`,
`VITE_CCTNS_DEMO_MODE=false`, `VITE_VPN_GATEWAY=CCTNS-GW-MH-01`,
`VITE_VPN_PINNED_FINGERPRINT=A1:B2:C3:D4:E5:F6:78:90:AB:CD:EF:12:34:56:78:90`.
Redeploy after any env change (Vite bakes env at build time).

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
