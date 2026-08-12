# AWS Docker Deployment

This project is containerized with:

- `frontend` exposed on `8088`
- `backend` exposed on `8089`

The frontend image build uses the **repo root** as Docker context (`dockerfile: frontend/Dockerfile`) so Vite can resolve shared backend utils (`@obs/backend` → `backend/src`), e.g. the attendance calculator. Always run `docker compose` from the project root.

## 1) Prepare environment variables

Create or update:

- `backend/.env` (required for backend runtime secrets — this is what Docker Compose loads)
- repo-root `.env` (required for frontend **build** args: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_API_BASE_URL`)
- `frontend/.env` (local Vite only; **ignored** by Docker image build)

Vite embeds `VITE_*` into the static JS at image build time. If Supabase vars are missing during `docker compose build`, the deployed site shows “Supabase configuration missing”.

Example repo-root `.env` on the server:

```bash
VITE_SUPABASE_URL=https://noitppmdzhgwuaviqkvo.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_API_BASE_URL=http://13.204.206.236:8089
```

Then rebuild the frontend (build-args only apply on build):

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

If you keep a copy under `deployed env/`, copy backend secrets into place on the server:

```bash
# on your Mac:
# scp "deployed env/backend" ubuntu@HOST:~/Onboarding_System/backend/.env
# scp "deployed env/frontend" ubuntu@HOST:~/Onboarding_System/.env
```

At minimum, backend needs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (full JWT — must not be truncated)
- `PORT=8089`
- `CORS_ORIGIN=https://staffing-portal.awignhub.in,http://<your-aws-host>:8088`
- `FRONTEND_URL=https://staffing-portal.awignhub.in`

`CORS_ORIGIN` may contain a comma-separated list when both the public domain and raw port URL need to work.

If the backend container is **unhealthy**, check logs first:

```bash
docker compose logs backend --tail=100
docker compose ps
```

Common causes:

1. Missing / empty `backend/.env` → process exits (`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set`)
2. Old healthcheck used `wget` (not in `node:20-alpine`) → fixed to use Node `fetch`
3. `npm start` used `node --use-system-ca`, which **Node 20 does not support** → process exits immediately (`bad option: --use-system-ca`). Production CMD is now `node src/index.js`. Domain / CORS does **not** affect the localhost healthcheck.

## 2) Build and start on the EC2 host

From project root:

```bash
docker compose build
docker compose up -d
```

Check status and logs:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

## 3) Open ports in AWS

In your EC2 Security Group, allow inbound TCP:

- `8088` (frontend)
- `8089` (backend, only if you want direct access)

If you only want users to use frontend, you can keep backend access restricted and let frontend proxy API traffic through `/api`.

## 4) Update deployment

After pulling latest code on EC2:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## 5) Frontend API base URL

By default, the frontend build leaves `VITE_API_BASE_URL` empty. That makes browser requests use same-origin paths like `/api/me`, and the frontend container's Nginx proxy sends them to the backend service.

For the split production domains, build the frontend with the backend origin only. Do not include `/api`; the application already prefixes every endpoint with `/api`.

```bash
VITE_API_BASE_URL=https://awign-onboarding-system-api.awignhub.in docker compose build frontend
docker compose up -d frontend
```

Avoid setting `VITE_API_BASE_URL` to `/api` or `https://.../api`; older builds with that value generated requests like `/api/api/me`.
