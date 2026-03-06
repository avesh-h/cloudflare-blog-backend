# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start local dev server via Wrangler
npm run deploy     # Deploy to Cloudflare Workers (minified)
npm run cf-typegen # Regenerate TypeScript types from Cloudflare bindings
```

For database schema changes:
```bash
npx prisma migrate dev   # Run migrations against direct DB (uses DIRECT_DATABASE_URL)
npx prisma generate      # Regenerate Prisma client (outputs to src/generated/prisma/)
```

There are no test or lint scripts configured.

## Architecture

This is a **Cloudflare Workers** backend using **Hono** as the web framework and **Prisma v7** with **PostgreSQL (Neon)** as the database.

### Key Constraints

- **Serverless/edge runtime**: No persistent connections or global state. A new `PrismaClient` must be instantiated per request using the `DATABASE_URL` from `c.env`.
- **Prisma Neon Adapter**: DB queries use `@prisma/adapter-neon` (`PrismaNeon`) instead of Prisma Accelerate. Prisma Accelerate was attempted but caused connection issues on the edge runtime.
- **`c.env` is request-scoped**: `DATABASE_URL` is only accessible inside route handlers via `c.env.DATABASE_URL` — it cannot be used at module scope.

### Pattern for Route Handlers

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

app.post("/api/v1/some-route", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // ... query and return JSON
});
```

### Environment Variables

Three separate places for env vars:
- `wrangler.jsonc` vars — `DATABASE_URL` (plain config, injected into Worker at runtime)
- `wrangler secret put` — `JWT_SECRET` (encrypted, stored on Cloudflare, never in code)
- `.dev.vars` — `JWT_SECRET` for local dev only (never committed to git)
- `.env` — `DATABASE_URL` for Prisma CLI only (migrations), has no effect on the Worker

### File Layout

- `src/index.ts` — Entry point, mounts routers and CORS middleware
- `src/types.ts` — Shared `Bindings` and `Variables` TypeScript types
- `src/middleware/auth.ts` — JWT auth middleware (protects blog routes)
- `src/routes/user.ts` — POST /api/v1/signup, POST /api/v1/signin
- `src/routes/blog.ts` — GET|POST|PUT /api/v1/blog/* (all auth protected)
- `prisma/schema.prisma` — Data models: User and Blog
- `wrangler.jsonc` — Cloudflare Workers config (entry point, compatibility date, bindings)
- `prisma.config.ts` — Tells Prisma CLI where the schema and migrations are, and which DB URL to use
- `.dev.vars` — Local-only secrets (gitignored)

### Deployment

- **Live URL**: https://backend.avesh-blog.workers.dev
- **Deploy command**: `npm run deploy`
- **Secrets on Cloudflare**: `JWT_SECRET` (set via `npx wrangler secret put JWT_SECRET`)

### Deploy Checklist (for future schema changes)

```bash
npx prisma migrate dev --name <migration-name>
npx prisma generate
npm run deploy
```
