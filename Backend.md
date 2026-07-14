# Backend — system-x-star-backend

NestJS API for the customs-clearance operations, accounting & invoicing system.

## Tech stack

| Concern            | Choice                                                    |
| ------------------ | --------------------------------------------------------- |
| Framework          | **NestJS 11** (Express platform)                          |
| Language           | **TypeScript**                                            |
| ORM                | **Prisma 7** via **driver adapter** (`@prisma/adapter-pg` + `pg`) |
| Database           | **PostgreSQL** (dev on **Neon**)                          |
| Config             | **@nestjs/config** + **Zod** validation                   |
| Validation         | **class-validator** / **class-transformer** (global `ValidationPipe`) |
| Security           | **helmet**, CORS                                          |
| API docs           | **@nestjs/swagger** (OpenAPI at `/docs`)                  |
| Health             | **@nestjs/terminus** (`/api/health`, Prisma ping)         |
| Testing            | **Jest** (`*.spec.ts` colocated in `src/`)                |
| Package manager    | **pnpm**                                                  |

## Packages

Runtime:
- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `rxjs`, `reflect-metadata` — framework.
- `@nestjs/config` + `zod` — env loading + fail-fast schema validation.
- `@prisma/client`, `@prisma/adapter-pg`, `pg` — Prisma 7 client + Postgres driver adapter.
- `class-validator`, `class-transformer` — DTO validation/transformation.
- `helmet` — security headers.
- `@nestjs/swagger` — OpenAPI generation.
- `@nestjs/terminus` — health checks.

Dev:
- `prisma` (CLI), `@types/pg`, `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`,
  `jest`, `ts-jest`, `ts-node`, `eslint`, `prettier`, types.

## Commands

```bash
pnpm start:dev            # watch-mode dev server
pnpm build               # nest build
pnpm start:prod          # node dist/main (after build)
pnpm lint                # eslint --fix
pnpm test                # jest unit
pnpm test <path|pattern> # run a single spec
pnpm test:e2e            # jest with test/jest-e2e.json
pnpm format              # prettier

pnpm prisma generate                 # regenerate the Prisma client
pnpm prisma migrate dev --name <n>   # create + apply a dev migration (needs DATABASE_URL)
pnpm prisma studio                   # browse the DB
```

> Note: `prisma` reads config from `prisma.config.ts` (Prisma 7). Prisma no longer
> auto-loads `.env`; `prisma.config.ts` loads `.env.${NODE_ENV}` for CLI commands.

## Layering

One Nest module per feature, wired with constructor **dependency injection**:

**controller** (HTTP, thin) → **service** (business logic) → **PrismaService** (repository).

- Controllers only handle transport (routing, DTOs, status codes) — no logic.
- Services are injectable and hold all business rules.
- `PrismaService` (`src/prisma/`) is the data layer; `PrismaModule` is `@Global` so any
  feature can inject it. Add feature models to `prisma/schema.prisma`.

## Prisma 7 notes

- The connection URL is **not** in `schema.prisma` — the CLI reads it from `prisma.config.ts`;
  the runtime connects through a driver adapter (`PrismaPg`) built in `PrismaService`.
- Uses the query-compiler + `pg` pool (works with local Postgres and Neon). For dev, use
  the Neon **pooled** connection string with `sslmode=require`.

## Production hardening (in `main.ts`)

- `helmet()` security headers.
- CORS from `CORS_ORIGIN` (`*` or comma-separated allowlist), `credentials: true`.
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Global route prefix `/api`.
- `enableShutdownHooks()` — Prisma disconnects cleanly on SIGTERM/SIGINT.
- Swagger UI at `/docs`.
- Config validated at boot via Zod (`src/config/env.validation.ts`) — invalid env fails fast.

## Environment

`ConfigModule` selects `.env.${NODE_ENV}` (`.env.development` / `.env.production`). Copy
`.env.example`; real env files are gitignored (they carry the DB secret).

| Var            | Purpose                                                        |
| -------------- | ------------------------------------------------------------- |
| `NODE_ENV`     | `development` \| `production` \| `test`                       |
| `PORT`         | HTTP port (default **3333**)                                  |
| `DATABASE_URL` | PostgreSQL connection string (Neon pooled URL in dev)         |
| `CORS_ORIGIN`  | `*` or comma-separated allowlist (frontend runs on `:3000`)   |
