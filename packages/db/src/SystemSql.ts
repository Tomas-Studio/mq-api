import { PgClient } from "@effect/sql-pg"
import { Config, Context, Effect, Layer, type Redacted } from "effect"
import { Reactivity } from "effect/reactivity"
import type { SqlClient } from "effect/sql"

/**
 * Cross-tenant SQL as `mq_system`, which bypasses row-level security (ADR-0013).
 *
 * Only for platform-admin endpoints, the payment webhook, and listing
 * organisations so scheduled jobs can fan out one tenant-scoped workflow per
 * organisation. Code that needs it names it in its requirements, so every
 * bypass is visible in types and review. Every new use needs a sentence in the
 * PR explaining why.
 */
export class SystemSql extends Context.Service<SystemSql, SqlClient.SqlClient>()("mq/db/SystemSql") {
  /** A small pool (max 5) on the given connection string. */
  static readonly layerFrom = (url: Redacted.Redacted) =>
    Layer.effect(
      SystemSql,
      PgClient.make({ url, maxConnections: 5, applicationName: "mq-api/system" })
    ).pipe(Layer.provide(Reactivity.layer))

  /** Reads `DATABASE_SYSTEM_URL` (pooled endpoint, `mq_system`). */
  static readonly layer = Layer.unwrap(
    Effect.gen(function*() {
      const url = yield* Config.Redacted("DATABASE_SYSTEM_URL")
      return SystemSql.layerFrom(url)
    })
  )
}
