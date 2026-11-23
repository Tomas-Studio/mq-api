# mq-api — Target Architecture

Status: Accepted · 2026-11-23
Decisions: [docs/adr](./adr/README.md) (ADR-0001 … ADR-0027)
Effect reference: `reference/effect` checked out at tag `effect@4.1.5` (gitignored)

mq-api is the platform API behind the new MEQuest web app and the new MEQuest
mobile app. It replaces the Nitro server inside `mqlearn` with a separately
deployed Effect v4 service, a redesigned organisation-first data model, and a
published, versioned contract that both clients consume.

Feature parity with legacy MEQuest is the floor (ADR-0008). Nothing in the
legacy design is carried over because it exists; it is carried over only where
it is the right design.

---

## 1. Starting point

Measured in `mqlearn` on 2026-11-22.

| Dimension | Legacy |
|---|---|
| Server code | ~143k LOC; 1,088 route files (451 GET, 397 POST, 103 PUT, 83 DELETE, 24 PATCH) |
| Schema | 205 tables, 311 migrations, 45 enums, 44 jsonb columns |
| Layering | 598 of 1,088 route files import `db` directly; 980 use raw `createError` |
| Response envelope | documented `ok()` helper used by 0 routes |
| Auth | 5 principals (staff, learner, overseer, external invitee, API client), 5 session tables, 4 login-token tables, 2 SSO link tables |
| Authorisation | 4 separate "feature" catalogues; `requireCohortManager` hand-called in 203 routes |
| Tenancy | none; billing per cohort; 68 tables carry `cohort_id`, none carries an organisation |
| Background | 15 cron sweeps in-process; email queue with retry; Redis for rate limits and SSE fan-out |
| Real-time | 16 SSE endpoints |
| Content | 38 courses as 1,878 block-JSON files in git (~50 block types); AI creator commits to GitHub |
| Tests | 124 files, service-level, database mocked |
| Infra | 3 hand-provisioned Azure App Services (demo, reinmaths-be, production), Node 20 (EOL), Postgres Flexible Server, no IaC |

The pricing model (v1.0, 2026-10-30) adds requirements the legacy platform
cannot meet: an organisation record, plan feature fences, learner caps at join,
staff-seat counting, AI-credit allowances with expiring top-ups, proctored
sitting allowances, library licence gating, per-campaign Assess banding, and
multi-currency invoicing.

---

## 2. System overview

```
  Web app (separate repo)        Mobile app (Expo, separate repo)
  app.mequest… / learn.<client>  ─────────── Bearer token ───────────┐
        │  cookie mq_session                                         │
        ▼                                                            ▼
  ┌──────────────────────── Azure Front Door + WAF ────────────────────────┐
  │  <any web domain>/api/*  ──►  mq-api server     (first-party cookies)  │
  │  <any web domain>/*      ──►  web app                                  │
  └────────────────────────────────────────────────────────────────────────┘
                 │                                      ▲
                 ▼                                      │ /realtime (SSE)
  ┌──────────────────────────────┐     ┌──────────────────────────────┐
  │ App Service: mq-api server   │     │ App Service: mq-api worker   │
  │ HttpApi · Authentication ·   │     │ SingleRunner · ClusterCron · │
  │ Policy · contexts            │     │ Workflows · Activities       │
  └───────┬──────────────┬───────┘     └──────────────┬───────────────┘
          │ pooled       │ direct (LISTEN)            │ direct
          ▼              ▼                            ▼
  ┌────────────────────────── Neon Postgres (Azure) ──────────────────────┐
  │ schemas per context · RLS on every tenant row · cluster_* storage      │
  └────────────────────────────────────────────────────────────────────────┘
  Blob Storage (media, presigned uploads) · Key Vault · Application Insights (OTel)
  Stripe · Paystack · Anthropic / OpenAI · Resend · Expo Push · Web Push
```

---

## 3. Repository layout

```
mq-api/
├── apps/
│   ├── server/              HTTP entrypoint: HttpApiBuilder, middleware, Main.ts
│   └── worker/              Background entrypoint: SingleRunner, ClusterCron, workflows
├── packages/
│   ├── contract/            @mequest/contract — HttpApi groups, Schemas, errors,
│   │                        content block union. Published. Depends on `effect` only.
│   ├── client/              @mequest/client — HttpApiClient factory, auth + version
│   │                        headers, idempotency helper. Published.
│   ├── domain/              Pure logic, no IO: policy gates, pricing and proration,
│   │                        discount caps, campaign banding, grading, spaced repetition.
│   ├── contexts/            Bounded contexts (section 4), shared by server and worker.
│   ├── db/                  Migrations per context schema, roles, RLS policies,
│   │                        TestDatabase layer, drift and role assertions.
│   └── etl/                 Legacy → new ETL, reconciliation, golden-output comparison.
├── infra/                   Bicep: main.bicep + params/<deployment>.bicepparam
├── docs/                    architecture.md, adr/
├── reference/effect/        Effect source at the installed release tag (gitignored)
└── CLAUDE.md                Effect v4 conventions for humans and agents
```

Bun workspaces with the isolated linker; `tsc -b` project references for
incremental type checking; vitest under Bun for tests (ADR-0028). All `effect`
and `@effect/*` versions pinned exactly and bumped together (ADR-0002).
Packages are created when the first slice needs them.

---

## 4. Bounded contexts

Each context lives in `packages/contexts/src/<context>/`, owns one Postgres
schema, and exposes exactly one public entry point (`index.ts`) exporting its
service(s) and Layer(s). Nothing else in a context is importable from outside
it. Enforcement: dependency-cruiser in CI, schema-level grants in Postgres, and
Layers that only provide the public service (ADR-0024).

| Context | Schema | Owns |
|---|---|---|
| `identity` | `identity` | People, credentials (password, passkey, email code, SSO link), sessions, SSO providers |
| `access` | `access` | Platform roles, organisation memberships, programme roles and per-member overrides, capability catalogue, **Policy** |
| `organisations` | `org` | Organisations, branding, custom domains, settings, "Powered by" |
| `programmes` | `programme` | Programmes (legacy cohorts), phases, enrolment lifecycle, course assignment, onboarding/offboarding, admission letters, records, calendar, announcements |
| `content` | `content` | Courses, immutable versions, units, blocks, library collections, licences |
| `learning` | `learning` | Progress events, knowledge checks, assignments and grading, flashcards, workbook and placement, mind maps, certificates, transcripts |
| `assessment` | `assessment` | Question banks, assessments, invitations, attempts, proctoring, grading, Assess campaigns |
| `live` | `live` | Live sessions, recordings, attendance, polls, live quizzes, session Q&A |
| `community` | `community` | Feed, moderation, groups and tracks, lead elections, group chat, messages, leagues, badges, streaks |
| `mentoring` | `mentoring` | Mentor profiles, availability, bookings, reviews, tiers |
| `commerce` | `commerce` | Plans, price books, subscriptions, add-ons, entitlements, usage ledger, invoices, collection, learner checkout, discounts, seat sales, payouts and platform fee |
| `notifications` | `notify` | Routing and preferences, in-app inbox, push (Expo, Web Push), email templates and delivery, realtime fan-out |
| `ai` | `ai` | `MeteredLanguageModel`, assistant, course creator, slideshow generator, AI grading support |
| `integrations` | `integration` | API clients (Checkout/Enrol API keys), outbound webhooks |
| `audit` | `audit` | Append-only audit log |
| `reporting` | `reporting` | Read-only SQL views over other schemas, CSV exports |

Context shape:

```
packages/contexts/src/programmes/
  Repo.ts        SqlClient queries, rows decoded with SqlSchema + Schema
  Service.ts     class Programmes extends Context.Service<Programmes>()("mq/Programmes", { make })
  Http.ts        HttpApiBuilder.group(MeQuestApi, "programmes", (handlers) => …)
  Workflows.ts   Workflow + Activity definitions (if any)
  index.ts       export { Programmes, ProgrammesLive, ProgrammesHttp, ProgrammeWorkflows }
```

---

## 5. Cross-cutting design

### 5.1 Request pipeline

```
Front Door ─► HttpApi router
  ─► Authentication middleware   cookie | bearer → CurrentPerson        (ADR-0015)
  ─► ClientVersion middleware    X-MeQuest-Client → metric; 426 if below min (ADR-0017)
  ─► Tenant resolution           path / domain → CurrentOrganisation
  ─► Policy middleware           endpoint's `Requires` annotation → 4 gates (ADR-0016)
  ─► handler                     calls one context service
  ─► context service             domain logic + typed errors
  ─► repository                  inside withTenant(org): transaction + set_config (ADR-0012)
```

Middleware is declared on groups in `@mequest/contract`, so the contract, the
OpenAPI document and the generated clients all show which endpoints need which
security scheme.

### 5.2 Tenancy and row-level security (ADR-0012, ADR-0013)

- Every tenant-scoped table has `organisation_id uuid NOT NULL`, RLS enabled and
  `FORCE ROW LEVEL SECURITY`.
- Policy shape: `USING (organisation_id = current_setting('app.organisation_id', true)::uuid)`.
- Tenant work runs inside `sql.withTransaction` and starts with
  `SELECT set_config('app.organisation_id', $1, true)` and `SET LOCAL ROLE <context role>`.
  Both are transaction-local, which is required with Neon's transaction-mode pooler.
- Roles, created with SQL (never the Neon Console, whose roles inherit `BYPASSRLS`):

  | Role | Attributes | Used by |
  |---|---|---|
  | `mq_migrator` | owns all schemas and tables; the Neon project's owner role, created with the project | migrations, ETL writes; never the runtime |
  | `mq_app` | `NOBYPASSRLS`; member of the context roles | server and worker runtime |
  | `mq_ctx_<context>` | `NOLOGIN`; grants on its own schema only | `SET LOCAL ROLE` per context |
  | `mq_system` | `BYPASSRLS` (or named in policies, see spike S3) | `SystemSql` only |

- `SystemSql` is a separate, small pool exposed as its own service. Code that
  crosses tenants must name it in its requirements, which makes every bypass
  visible in types and code review. Platform-admin endpoints and the payment
  webhook use it. Scheduled jobs use it only to list organisations, then fan out
  one workflow per organisation in that organisation's RLS scope.
- A person who belongs to several organisations (e.g. a learner in two academies)
  sees a cross-organisation view assembled from one tenant-scoped read per
  membership.
- CI asserts `rolbypassrls = false` for `mq_app` and that every table in a tenant
  schema has RLS forced.

### 5.3 Identity and sessions (ADR-0014, ADR-0015)

- One `identity.people` row per human (unique email). Capabilities come from
  memberships: platform role, organisation role, programme role, assessment invitation.
- External candidates are people with only an invitation (email + access code,
  no password) and a retention policy tied to the campaign.
- API clients are non-human principals in `integration`, organisation-scoped.
- One opaque session token type in `identity.sessions`. Web receives it as the
  httpOnly `mq_session` cookie, first-party on every domain because `/api` is
  served through Front Door. Mobile stores it in SecureStore and sends `Authorization: Bearer`.
- Sign-in methods: email code, password, passkey, SSO (OIDC/SAML per organisation).
- Resolution is cached briefly per instance. Revocation (suspension, staff removal,
  "sign out everywhere") deletes the session row and evicts the cache entry.

```ts
// packages/contract/src/identity/Security.ts
export class CurrentPerson extends Context.Service<CurrentPerson, Person>()("mq/CurrentPerson") {}

export class Authentication extends HttpApiMiddleware.Service<Authentication, {
  provides: CurrentPerson
}>()("mq/Authentication", {
  security: {
    cookie: HttpApiSecurity.apiKey({ in: "cookie", key: "mq_session" }),
    bearer: HttpApiSecurity.bearer
  },
  error: Unauthorized
}) {}
```

### 5.4 Authorisation (ADR-0016)

One capability catalogue in `packages/domain` replaces the four legacy
catalogues. Endpoints declare what they need with an annotation; the Policy
middleware reads it from the endpoint (middleware receives `endpoint` and
`group`) and evaluates four gates in a fixed order. The first failing gate wins.

| Order | Gate | Source | Denial |
|---|---|---|---|
| 1 | Plan | organisation's plan + add-ons (commerce entitlements) | `not_in_plan` (carries upgrade option) |
| 2 | Programme | programme's switches | `disabled_by_programme` |
| 3 | Role | person's access level for the capability (`none`/`view`/`manage`) | `insufficient_role` |
| 4 | Learner tier | learner's pricing tier | `not_in_tier` |

Resource rules that need loaded data (author-only edits, read-only submitted
attempts) are typed errors in the owning context's service, not Policy gates.

### 5.5 Errors

- Domain errors are `Schema.TaggedError` classes in `@mequest/contract`, with an
  `httpApiStatus` annotation, and are listed on the endpoints that can return them.
- Handlers may only fail with declared errors; anything else is a defect,
  logged with its trace ID and returned as a 500 that carries the trace ID.
- `Forbidden` always carries its `gate` so clients can render an upgrade prompt,
  hide the feature, or show read-only state.

### 5.6 Metering and billing (ADR-0018, ADR-0019)

- `commerce.usage_ledger` is append-only: grants, top-up lots with expiry, and
  usage entries, each with an idempotency key. Balances and monthly peaks are
  projections; enforcement reads a cached balance with a soft-cap threshold.
- Meters: `ai_credits` (1 credit = US$0.01 of model cost), `proctored_sittings`,
  `active_learners` (monthly peak, packs of 50), `staff_seats`, `live_programmes`,
  `storage_gb`, `streaming_gb`, `assess_sittings` (per campaign).
- `MeteredLanguageModel` is the only Layer that provides the AI language model,
  so no code path reaches a model without writing a ledger entry.
- Invoices are computed by mq-api from the price book (USD/NGN/GBP), plan, add-ons,
  ledger overage, discounts (stack capped at 30%, never on usage), proration and
  quarterly true-ups. Invoices are immutable. Collection is pluggable: Stripe
  (USD/GBP), Paystack (NGN), bank transfer with reconciliation.
- Dunning: 7-day grace, then managers read-only; learners are never locked out.
- Learner payments (checkout, tiers, discounts, seat sales) use the existing
  provider split model: Stripe Connect / Paystack subaccounts, platform fee by plan.

### 5.7 Background work (ADR-0020)

- `apps/worker` runs `SingleRunner` with `SqlMessageStorage`/`SqlRunnerStorage`
  on a direct Neon connection. The cluster storage takes session-level advisory
  locks, which Neon's pooler does not support.
- `ClusterCron` replaces the 15 legacy sweeps, each fanning out per organisation.
- Durable workflows for multi-step processes, e.g. paid enrolment:
  create order → `DurableDeferred` until the payment webhook confirms → allocate
  seat → send welcome. Email and outbound webhooks are retried Activities.
- The server only starts workflows; it never runs them. Long AI generation runs
  in the worker and streams progress to clients over `/realtime`.
- `effect/cluster` and `effect/workflow` are `@stability unstable` and
  `SingleRunner` is documented as single-process only. Spike S4 proves the
  topology before anything depends on it.

### 5.8 Real-time and notifications (ADR-0021)

- One multiplexed `GET /realtime?topics=…` SSE stream per client session, declared
  in the contract. Topic subscriptions are authorised by Policy.
- Writes go through normal endpoints, then `NOTIFY realtime, '<topic>|<id>'`
  (IDs only, given the 8 KB payload limit). Each server instance holds one
  direct Neon connection that `LISTEN`s and pushes to its subscribers.
- AI token streaming stays a dedicated SSE response on its endpoint.
- `notifications.dispatch(event)` routes by preference to in-app, Expo push,
  Web Push and email digest. Redis is retired.

### 5.9 Content (ADR-0022)

- `content.courses` → `course_versions` (draft/published, immutable once published,
  content hash) → `units` → `blocks` (JSONB).
- Blocks are a `Schema.Union` of ~50 block types in `@mequest/contract`, so web
  and mobile render the same validated set and a new block type is a contract change.
- MEQuest library: authored as JSON in git, published by CI through the API.
  Client, custom and AI-generated courses: authored in-app as drafts.
- Ownership per organisation; library courses licensed per learner for 12 months.
- Mobile downloads a published version as one bundle; the ETag is the content hash.

### 5.10 Offline and idempotency (ADR-0023)

- Offline on mobile: downloaded lessons, knowledge checks, flashcards, progress.
  Online-only: assessments, community, live features, payments.
- Offline writes are append-only events with client-generated keys, replayed via
  `POST /learning/events:batch`; the server deduplicates and recomputes progress.
- Every mutating endpoint accepts `Idempotency-Key`; responses are stored per key
  for a retention window, which also makes retries on poor networks safe.

### 5.11 API evolution (ADR-0017)

- One live API, no URL versions. Changes must be additive.
- CI generates OpenAPI from `MeQuestApi` (`OpenApi.fromApi`) and diffs it against
  the last released contract; a breaking change fails the build unless the
  endpoint has gone through deprecation (`Deprecation` + `Sunset` headers,
  support window, zero callers observed).
- Clients send `X-MeQuest-Client: <platform>/<version>`; below the configured
  minimum the server returns 426 and the app shows a forced-update screen.
- `@mequest/contract` follows semver: additive change = minor, deprecation removal = major.

### 5.12 Configuration and observability

- Configuration through Effect `Config` (`Config.String`, `Config.Redacted`,
  `Config.Port`, `Config.withDefault`); secrets are `Redacted` and never logged.
  Values come from App Service settings backed by Key Vault references.
- OpenTelemetry via `effect/observability` to Application Insights. Every
  service method is an `Effect.fn` span; every error response carries the trace ID.
- Rate limiting: per-IP rules in Front Door WAF; a Postgres-backed limiter on
  sign-in, code and invitation endpoints.

---

## 6. Database and connection topology (ADR-0025)

Neon on Azure (Germany West Central), one Neon project per deployment.

| Connection | Endpoint | Role | Why |
|---|---|---|---|
| Server queries | pooled (`-pooler`) | `mq_app` | high connection count, transaction-scoped tenant context |
| Server `LISTEN` (1 per instance) | direct | `mq_app` | LISTEN/NOTIFY unsupported on the pooler |
| `SystemSql` pool (max 5) | pooled | `mq_system` | stateless cross-tenant reads |
| Worker | direct | `mq_app` | cluster storage uses session advisory locks |
| Migrations, ETL | direct | `mq_migrator` | DDL, long transactions |

- Production compute is always on (no scale-to-zero); preview branches scale to zero.
- Network: App Service VNet integration → NAT gateway (static egress IP) →
  Neon public endpoint, TLS `verify-full`, IP allow-list containing only the NAT IP.
  Neon documents private networking only via AWS PrivateLink; a regulated client
  needing private database connectivity gets Postgres Flexible Server in its
  dedicated-instance parameter file, with no code change.
- Branches: `main` (production); `legacy-mirror` (anonymised legacy restore,
  reset nightly); `etl-rehearsal` (reset nightly); `pr-<n>` (preview);
  `pre-switch-<date>` (restore point at each go/no-go).

---

## 7. Deployment topology (ADR-0025)

`infra/main.bicep` with one parameter file per deployment:

```
infra/params/demo.bicepparam
infra/params/reinmaths.bicepparam      dedicated instance (own Neon project, own domain)
infra/params/production.bicepparam
```

Each deployment: Front Door profile and routes, App Service plan, `app-mqapi-server`
(scale-out rules), `app-mqapi-worker` (Always On, one instance), VNet + NAT gateway,
Neon project (Azure Native ISV resource), Blob Storage, Key Vault, Application
Insights, managed identities. Some Neon Bicep resource types are preview API
versions; if one is unusable, the pipeline provisions that piece with the Neon API.

Runtime: Bun 1.4 (ADR-0028). Server and worker run from one container image
(`oven/bun`, pinned by digest) in Azure Container Registry; App Service for
Containers pulls it with a managed identity, and each app sets its own start command.

---

## 8. Cutover plan (ADR-0005, ADR-0007 … ADR-0010)

1. **Freeze.** Agree a freeze date after a short window for in-flight work.
   Legacy moves to a `release/*` branch: fixes and security only. The feature
   inventory on that date is the parity list.
2. **Pricing before the switch.** Contracts state limits; monthly SQL usage
   reports drive manual overage invoices. The report queries become golden
   fixtures for the usage ledger.
3. **Build** in the order of section 9.
4. **Nightly rehearsal.** Anonymised legacy restored to `legacy-mirror` → ETL into
   `etl-rehearsal` → reconcile row counts → compare golden outputs (progress,
   certificate eligibility, grades, points, transcripts, usage-report figures)
   computed by legacy vs by mq-api → run API journeys against the migrated data.
5. **Switch each deployment**, in order: demo → reinmaths → production.
   Freeze legacy writes → take `pre-switch-<date>` branch → final ETL → reconcile
   + golden diff → **go / no-go**. After go: roll forward only; the pre-switch
   branch is the disaster-restore point.

Golden outputs from legacy are produced by a script added to `mqlearn` during
the freeze (tooling, not a feature).

---

## 9. Build order (ADR-0027)

### Slice 0: walking skeleton

Feature: email-code sign-in → current organisation → list my programmes, on web
and mobile, deployed to demo infrastructure behind Front Door on a test custom domain.

Acceptance checks:

- [ ] `infra/` provisions the full demo topology from Bicep, including Neon
- [ ] Roles created by migration; CI asserts `mq_app` cannot bypass RLS and every tenant table forces RLS
- [ ] A cross-tenant read through `SqlClient` returns nothing; through `SystemSql` it succeeds
- [ ] `withTenant` (`set_config` + `SET LOCAL ROLE`) behaves correctly through the Neon pooler
- [ ] Cookie session works first-party on the custom domain; bearer works from the Expo app
- [ ] Worker runs one `ClusterCron` job exactly once with two server instances running, fanned out per organisation
- [ ] `/realtime` delivers a `programme` topic event across two server instances through Front Door
- [ ] `@mequest/contract` and `@mequest/client` published; the Expo app imports them and runs on device
- [ ] OpenAPI diff gate fails a deliberately breaking PR
- [ ] ETL migrates people, organisations and programmes from `legacy-mirror`; reconciliation passes
- [ ] Golden-output harness compares one computation end to end
- [ ] Traces visible in Application Insights with trace IDs on error responses
- [ ] Parity list started from the freeze inventory

### Then, in dependency order

identity → organisations + access + commerce entitlements/usage → content →
learning → assessment → live → community + mentoring → notifications + ai →
commerce invoicing and collection → integrations → reporting + audit.

---

## 10. Spike checks (assumptions not yet proven)

| # | Assumption | Fallback if false |
|---|---|---|
| S1 | Front Door routes `/api/*` on client custom domains to the server with managed TLS; cookies stay first-party; SSE is not buffered or cut | Dedicated SSE hostname with streaming-friendly settings |
| S2 | `set_config(…, true)` and `SET LOCAL ROLE` behave inside transactions through Neon's pooler | Direct connections for the server pool (larger compute) |
| S3 | `mq_system` can be created with `BYPASSRLS` via SQL on Neon | Policies admit `current_user = 'mq_system'` explicitly |
| S4 | `SingleRunner` worker on App Service survives restarts and redeploys, with exactly-once cron | Postgres job queue on Effect primitives (ADR-0020 alternative) |
| S5 | One direct `LISTEN` connection per instance reconnects cleanly after Neon compute restarts | Short polling of an outbox table |
| S6 | `@mequest/contract` (Effect v4) runs in Expo / Hermes at an acceptable bundle size | Generate a thin client from OpenAPI for mobile |
| S7 | Neon resources provision from Bicep (preview API versions) | Neon API step in the pipeline |
| S8 | The Bun container on App Service passes health checks, streams SSE through Front Door, stops gracefully on redeploy, and holds the worker's direct `LISTEN` and advisory-lock connections | Azure Container Apps with the same image |

---

## 11. Defaults

| Area | Default |
|---|---|
| Runtime and tooling | Bun 1.4 (runtime, workspaces, scripts), vitest under Bun, TypeScript 7 strict via `tsc -b`, oxlint + dprint matched to the Effect repo's native rules (ADR-0028) |
| Packages | `@mequest/*` on GitHub Packages, which requires a GitHub organisation named `mequest` (otherwise `@itaobong/*`) |
| Email | Resend behind a `Mailer` service; SendGrid as an alternative Layer |
| AI | `effect/ai` with Anthropic and OpenAI Layers behind `MeteredLanguageModel`; dedicated instances may bring their own key (credits then don't apply) |
| Media | Azure Blob with presigned direct uploads from web and mobile |
| Region | Germany West Central for App Service and Neon |
| Docs | One ADR per decision; `CLAUDE.md` pins Effect v4 conventions |

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Effect modules beyond core are `@stability unstable` (breaking changes in minor releases) | Exact pins, one-release-at-a-time upgrades, `reference/effect` at the installed tag, context seams so changes stay local |
| Most Effect material and model training data is v3 | `CLAUDE.md` with verified v4 idioms; the reference source and its tests are the documentation |
| Big-bang scope (1,088 routes, 205 tables) with nothing live until the first switch | Freeze, walking skeleton, dependency order, demo switch first |
| Identity merge collisions (same email as staff and learner, `linked_learner_id` gaps) | ETL conflict report reviewed before each switch |
| No private networking from App Service to Neon on Azure | Hardened public endpoint; Postgres Flexible for clients that require private connectivity |
| Mobile builds in the wild for months | Additive-only API, OpenAPI diff gate, minimum-version 426 |
