import { BunRuntime, BunServices } from "@effect/platform-bun"
import { PgClient } from "@effect/sql-pg"
import { Config, Effect, Layer } from "effect"
import { idTypes } from "../IdTypes.ts"
import { seedDemo } from "../Seed.ts"

// `bun run db:seed`: seeds the demo organisation (see Seed.ts) for the person
// named by SEED_EMAIL and SEED_NAME, as the migrator.

const SeedPersonConfig = Config.all({
  email: Config.String("SEED_EMAIL"),
  name: Config.String("SEED_NAME").pipe(Config.withDefault("Demo Owner"))
})

// Direct connection as the migrator (ADR-0025).
const SeedDatabase = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_MIGRATOR_URL"),
  applicationName: Config.succeed("mq-api/seed"),
  types: Config.succeed(idTypes)
})

Effect.gen(function*() {
  return yield* seedDemo(yield* SeedPersonConfig)
}).pipe(
  Effect.withSpan("db.seed"),
  Effect.provide(Layer.mergeAll(SeedDatabase, BunServices.layer)),
  BunRuntime.runMain
)
