import { BunRuntime, BunServices } from "@effect/platform-bun"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer } from "effect"
import { runMigrations } from "../Migrations.ts"

// Direct (unpooled) connection as mq_migrator (ADR-0025).
const MigratorDatabase = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_MIGRATOR_URL"),
  applicationName: Config.succeed("mq-api/migrate")
})

runMigrations.pipe(
  Effect.tap((applied) =>
    applied.length === 0
      ? Effect.log("No pending migrations")
      : Effect.log(`Applied ${applied.map(([id, name]) => `${id}_${name}`).join(", ")}`)
  ),
  Effect.provide(Layer.mergeAll(MigratorDatabase, BunServices.layer)),
  BunRuntime.runMain
)
