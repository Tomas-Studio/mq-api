# Architecture Decision Records

All accepted on 2026-11-23. Overview: [../architecture.md](../architecture.md).

| # | Decision |
|---|---|
| [0001](0001-backend-only-repository.md) | Backend-only repository with a pinned Effect reference |
| [0002](0002-effect-v4.md) | Build on Effect v4, pinned exactly |
| [0003](0003-separate-client-repos.md) | Separate client repositories; contract published as a package |
| [0004](0004-mobile-react-native-expo.md) | Mobile client is React Native + Expo |
| [0005](0005-big-bang-per-deployment.md) | Big-bang cutover, one switch per deployment |
| [0006](0006-clean-api-redesign.md) | Clean API redesign with no legacy adapter |
| [0007](0007-redesigned-schema-etl.md) | Redesigned schema with a rehearsed ETL |
| [0008](0008-legacy-freeze.md) | Freeze legacy features after an in-flight window |
| [0009](0009-cutover-safety-net.md) | Layered cutover safety net |
| [0010](0010-pricing-before-switch.md) | Sell the new pricing now; meter with reports until each switch |
| [0011](0011-data-access-effect-sql.md) | Data access with effect/sql and @effect/sql-pg |
| [0012](0012-organisation-tenancy-rls.md) | Organisation tenancy enforced by row-level security |
| [0013](0013-systemsql-bypass.md) | Typed SystemSql for cross-tenant work; jobs fan out per organisation |
| [0014](0014-person-identity.md) | One Person identity with scoped memberships |
| [0015](0015-sessions-cookie-and-bearer.md) | Opaque server sessions; cookie on web, bearer on mobile |
| [0016](0016-capability-policy.md) | One capability catalogue, declared per endpoint |
| [0017](0017-additive-api-evolution.md) | Additive-only API evolution with a CI gate and minimum client version |
| [0018](0018-usage-ledger.md) | Append-only usage ledger with structural metering |
| [0019](0019-mq-api-owns-invoicing.md) | mq-api owns organisation invoicing; providers only collect |
| [0020](0020-workflow-cluster-worker.md) | Durable background work on effect/workflow + cluster in a separate worker |
| [0021](0021-realtime-sse-notify.md) | Real-time over one typed SSE stream with LISTEN/NOTIFY |
| [0022](0022-versioned-content.md) | Versioned course content in Postgres, two authoring paths |
| [0023](0023-offline-idempotent-events.md) | Offline learning via idempotent event batches |
| [0024](0024-modular-monolith.md) | Modular monolith with enforced bounded contexts |
| [0025](0025-azure-app-service-neon.md) | Azure App Service + Front Door + Neon, defined in Bicep |
| [0026](0026-tdd-real-postgres.md) | Test-first, integration-first on real Postgres |
| [0027](0027-walking-skeleton-first.md) | Walking skeleton first, then dependency order |
| [0028](0028-bun-runtime-and-toolchain.md) | Bun runtime and toolchain (amends 0002, 0025, 0026) |

New decisions get the next number. A decision is changed by a new ADR that
supersedes the old one; the old one's status becomes `Superseded by ADR-NNNN`.
