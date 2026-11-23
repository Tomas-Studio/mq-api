import { PgClient } from "@effect/sql-pg"
import { Config } from "effect"

/**
 * The runtime `SqlClient` as `mq_app` on Neon's pooled endpoint (ADR-0025).
 * Tenant data is reached only through `withTenant` (ADR-0012).
 */
export const DatabaseLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
  maxConnections: Config.Int("DATABASE_POOL_MAX").pipe(Config.withDefault(10)),
  applicationName: Config.String("DATABASE_APPLICATION_NAME").pipe(Config.withDefault("mq-api"))
})
