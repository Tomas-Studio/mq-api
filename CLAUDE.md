# mq-api

Platform API for the new MEQuest web and mobile apps. Effect v4, TypeScript, Bun, Postgres (Neon).

Read before changing anything:

- `docs/architecture.md`: target architecture, contexts, topology, Slice 0, spikes
- `docs/adr/`: one record per decision; change a decision with a new ADR, never by drift

Tone for docs, comments and commit messages: direct and professional.

## Effect version and the reference source

- Effect is pinned exactly: `effect`, `@effect/platform-bun`, `@effect/sql-pg`,
  `@effect/vitest`, `@effect/ai-*` all at the same version (currently 4.1.5).
  Never use `^` or `~` (`bunfig.toml` sets `install.exact`). Bump them together
  in one PR (ADR-0002).
- `reference/effect` is the Effect source checked out at the installed tag
  (`git -C reference/effect describe --tags` must name `effect@<installed version>`).
  Move it to the new tag in the same PR that bumps Effect.
- **The reference source is the documentation.** Most tutorials, blog posts and
  model training data describe Effect v3 and are wrong for this repo. Before using
  an API, confirm it in `reference/effect/packages/*/src`, its tests
  (`packages/*/test`) or typetests (`packages/effect/typetest`).
  `reference/effect/MIGRATION.md` lists v3 → v4 changes.
- Modules outside core (`effect/http`, `effect/http-api`, `effect/sql`,
  `effect/workflow`, `effect/cluster`, `effect/ai`, `effect/observability`, and all
  `@effect/*` packages) are `@stability unstable`: breaking changes can land in
  minor releases. Keep their use inside contexts and the contract package.

## v4 idioms (verified against effect@4.1.5)

| Instead of (v3 habit) | Write (v4) |
|---|---|
| `@effect/schema` | `import { Schema } from "effect"` |
| `@effect/platform` HttpApi | `import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity, HttpApiClient, OpenApi } from "effect/http-api"` |
| `@effect/platform` HTTP | `import { HttpRouter, HttpServer, HttpClient } from "effect/http"` |
| `@effect/sql` | `import { SqlClient, SqlSchema, SqlResolver, Migrator } from "effect/sql"`; driver `import { PgClient, PgMigrator } from "@effect/sql-pg"` |
| `@effect/workflow`, `@effect/cluster` | `import { Workflow, Activity, DurableDeferred, DurableClock } from "effect/workflow"`; `import { ClusterCron, SingleRunner } from "effect/cluster"` |
| `Context.Tag` / `Effect.Service` | `class X extends Context.Service<X>()("mq/X", { make: Effect.gen(…) }) {}` then `Layer.effect(X, X.make)`; shape-only keys: `Context.Service<X, Shape>()("mq/X")` |
| `Config.string`, `Config.redacted`, `Config.integer` | `Config.String("X")`, `Config.Redacted("X")`, `Config.Int("X")`, `Config.Port`, `Config.URL`, `Config.Boolean`, `Config.Duration`, `Config.withDefault` |
| `.addSuccess(...)` / `.addError(...)` chains | `HttpApiEndpoint.get("name", "/path", { success, error, payload })` |
| group implementation | `HttpApiBuilder.group(Api, "group", (handlers) => handlers.handle("name", (ctx) => …))` |
| serving | `HttpRouter.serve(HttpApiBuilder.layer(Api).pipe(Layer.provide(groupLayers)))` with `BunHttpServer.layerConfig({ port: Config.Port("PORT") })` from `@effect/platform-bun`; run via `Layer.launch(…).pipe(BunRuntime.runMain)`; tests use `BunHttpServer.layerTest` + `HttpApiClient.make(Api)` |
| security middleware | `class Authentication extends HttpApiMiddleware.Service<Authentication, { provides: CurrentPerson }>()("mq/Authentication", { security: { cookie: HttpApiSecurity.apiKey({ in: "cookie", key: "mq_session" }), bearer: HttpApiSecurity.bearer }, error: Unauthorized }) {}`; implement each scheme as `(httpEffect, { credential, endpoint, group }) => …` |
| endpoint metadata | `.annotate(Key, value)` where `Key` is a `Context.Key` (e.g. `Context.Reference`) |
| errors | `class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: Id }) {}`; HTTP status via the `httpApiStatus` annotation (pattern in `effect/http-api/HttpApiError.ts`) |
| tests | `import { it, describe, expect } from "@effect/vitest"`; `it.effect`, `it.layer(layer)("name", (it) => …)`, `it.prop`; `TestClock` from `effect/testing` |
| telemetry export | `import { Otlp } from "effect/observability"` |

When an idiom is not in this table, look it up in the reference before writing it.

## Architecture rules

1. **Context boundaries** (ADR-0024). Code in `packages/contexts/src/<a>/` may
   import another context only through `packages/contexts/src/<b>/index.ts`.
   Never import another context's `Repo`, tables or internal modules.
2. **Tenant data** (ADR-0012). Tenant-scoped reads and writes run inside
   `withTenant(organisationId, …)`, which opens a transaction, sets
   `app.organisation_id` with `set_config(…, true)` and `SET LOCAL ROLE`.
   Never set session-level state: Neon's pooler is transaction mode.
3. **Cross-tenant access** (ADR-0013) only through `SystemSql`, only for
   platform-admin endpoints, the payment webhook, and listing organisations for
   job fan-out. Every new `SystemSql` use needs a sentence in the PR explaining why.
4. **Endpoints** (ADR-0016). Every endpoint declares its errors and either a
   `Requires` capability annotation or an explicit public marker. Handlers fail
   only with declared errors.
5. **Contract** (ADR-0017). `packages/contract` depends on `effect` only. Changes
   are additive; the OpenAPI diff gate must pass. Removals go through deprecation.
6. **AI** (ADR-0018). Language models are reached only through `MeteredLanguageModel`.
7. **Mutations** (ADR-0023) accept `Idempotency-Key`.
8. **Time.** Domain logic reads time from `Clock` / `DateTime`, never
   `Date.now()` or `new Date()`, so `TestClock` controls it.
9. **Config** only through Effect `Config`; secrets are `Redacted` and never logged.
10. **Types.** No `any`. Decode untrusted data with Schema at the boundary; no `as`
    casts on decoded or external data.
11. **Services** expose methods built with `Effect.fn` so each call is a traced span.

## Database (Neon)

- Create runtime roles (`mq_app`, `mq_system`, `mq_ctx_*`) only with SQL
  migrations, never in the Neon Console: Console roles join `neon_superuser`,
  which has `BYPASSRLS`. `mq_migrator` is the Neon project's owner role and is
  never used at runtime.
- Pooled endpoint for server queries. Direct connections for `LISTEN`, the worker
  (cluster storage uses session advisory locks), migrations and the ETL.
- Every tenant table: `organisation_id NOT NULL`, RLS enabled and forced.
  CI asserts this and that `mq_app` cannot bypass RLS.

## Testing (ADR-0026)

- Test first. Integration tests (`*.integration.test.ts`) run against real
  Postgres: the server named by `TEST_DATABASE_URL` (CI service container, local
  Postgres, Neon branch), else Testcontainers. Migrations, roles and RLS are
  applied once to a template database; each test file gets its own clone
  (`TestDatabase.layer`).
- Tests run under Bun through vitest (`bun run --bun vitest`), never `bun test`:
  `@effect/vitest` needs vitest (ADR-0028).
- Replace external providers with Layer test doubles; never module-mock.
- Pure pricing, policy and grading logic gets property tests (`it.prop`).
- Test by risk (ADR-0033). Tier 1, thorough and mutation-checked: RLS and tenancy, sign-in and sessions,
  access checks, rate limits, money, grading and progress, the ETL, the API contract. Tier 2, ordinary
  endpoints: one pass over HTTP (success, each declared error, permission). Tier 3, dev tooling: a few
  smoke tests. Nothing for what types and schemas already enforce, or for Effect and Postgres themselves.
  Prefer one invariant test across the whole schema or API over a test per feature, and test shared code
  once. No flaky tests; the full suite stays under 5 minutes in CI.

## Commands

Bun 1.4 for everything (ADR-0028). Local settings go in `.env.local` (see `.env.example`). Bun loads it
only for commands started from the repo root, so root scripts call entry files directly; `bun run --filter`
runs in the package folder and would not see it.

| Task | Command |
|---|---|
| Install | `bun install` (exact versions, isolated linker; commit `bun.lock`) |
| Type check | `bun run check` (`tsc -b`, TypeScript 7) |
| Lint and format check | `bun run lint` (oxlint + dprint); fix with `bun run format` |
| All tests | `bun run test` (vitest under Bun; integration tests need `TEST_DATABASE_URL` or Docker) |
| Unit tests only | `bun run --bun vitest run --project unit` |
| Integration tests only | `bun run --bun vitest run --project integration` |
| Run the server | `bun run dev` (watch) or `bun apps/server/src/Main.ts`; `PORT` defaults to 8080 |
| Migrate a database | `bun run db:migrate` with `DATABASE_MIGRATOR_URL` |
| Seed a local database | `bun run db:seed` with `DATABASE_MIGRATOR_URL` and `SEED_EMAIL` (idempotent; refuses roles subject to RLS) |

Workspace: `packages/contract` (`@mequest/contract`, effect only), `packages/db` (`@mequest/db`:
migrations, roles, `withTenant`, `withGlobal`, `withPerson`, `SystemSql`, `findRlsViolations`, and
`@mequest/db/testing`), `packages/contexts` (`@mequest/contexts/<context>`, one export per context: `access`,
`identity`, `notifications`, `organisations`, `programmes`), `apps/server` (`@mequest/server`). Add a package
to the root `tsconfig.json` references when you create it.
New tenant tables go in a new migration with RLS enabled and forced, a `tenant_isolation` policy on
`tenancy.current_organisation_id()`, and grants to their context role; `findRlsViolations` fails otherwise.
Any other policy must be `FOR SELECT`. Tables whose rows name one person (memberships, roles) add a
SELECT-only `own_rows` policy on `person_id = tenancy.current_person_id()`, read through
`withPerson({ personId, role })`, which sets no organisation, cannot write and never nests (ADR-0031).
Global tables (identity only, ADR-0012) have no RLS, are reachable only through `withGlobal(<context role>)`,
and are listed in `globalTables` in `RlsInvariants.ts` with their ADR.
New contexts add their `mq_ctx_<context>` role in a migration and in `src/Roles.ts`.
Ids (ADR-0032) are `id uuid PRIMARY KEY DEFAULT uuidv7()` (Postgres 18+). On the wire and in TypeScript they
are 32 lowercase hex digits with no hyphens (the contract's id schemas); every `PgClient` passes
`types: idTypes` from `@mequest/db` so `uuid` columns read that way. Parameters need nothing: Postgres
accepts the hyphen-free form.

Organisation-scoped endpoints (ADR-0030) live under `/organisations/:organisationId/…` with
`params: { organisationId: OrganisationId }` and `.middleware(OrganisationScope).middleware(Authentication)`,
in that order: middleware added later runs first, and `OrganisationScope` needs `CurrentPerson`. Handlers
read `CurrentOrganisation`; non-members, unknown and malformed ids get 404 `OrganisationNotFound`. A
contract test fails if the path and the middleware disagree.

Server tests (`apps/server/test`) run the whole API on `BunHttpServer.layerTest` against a database clone
via `TestServer.ts`; sent email lands in `Mailbox`. `Sessions.ts` adds people and signs them in
(`newPerson`, `signedInApi`). Tests set each request's client address with
`X-Forwarded-For` (`fromAddress`, `fromNewAddress`); loopback is a trusted proxy there. The server needs
`DATABASE_URL`, `IDENTITY_CODE_SECRET` and `MAIL_TRANSPORT=log` (the only transport until Resend lands; it
writes sign-in codes to the log); `TRUSTED_PROXIES` is optional.

Rate limits (ADR-0029) use Effect's `RateLimiter` from `effect/persistence` on `RateLimiterLive` from
`@mequest/db` (Postgres, fixed window only). Read the client address from `request.remoteAddress`, never
from a header: `HttpMiddleware.xForwardedHeaders` has already applied `TRUSTED_PROXIES`.

## Git

Commit or push only when asked. Never commit `reference/`, `.env` files or secrets.
