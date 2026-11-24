import { Clock, Duration, Effect, Layer, Schema } from "effect"
import { RateLimiter } from "effect/persistence"
import { SqlClient, SqlSchema } from "effect/sql"
import { createHash } from "node:crypto"
import { withGlobal } from "./Tenancy.ts"

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex")

const Counter = Schema.Struct({ count: Schema.Int, expiresAt: Schema.Date })

const storeError = (operation: string) => (cause: unknown) =>
  new RateLimiter.RateLimiterError({
    reason: new RateLimiter.RateLimitStoreError({ message: `PgRateLimiterStore: ${operation} failed`, cause })
  })

const unsupported = (algorithm: string) =>
  Effect.die(new Error(`PgRateLimiterStore supports the fixed-window algorithm only, not ${algorithm} (ADR-0029)`))

/**
 * A `RateLimiterStore` on `ratelimit.counters`, so limits hold across server
 * instances and deploys (ADR-0029). Fixed window only.
 *
 * Each call locks its counter row in a transaction of its own, then applies the
 * same rules as Effect's in-memory store. Keys are stored as SHA-256 hashes.
 * Time comes from `Clock`.
 */
export const makePgRateLimiterStore = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  const lockCounter = SqlSchema.findOne({
    Request: Schema.String,
    Result: Counter,
    execute: (keyHash) =>
      sql`SELECT count, expires_at AS "expiresAt" FROM ratelimit.counters WHERE key_hash = ${keyHash} FOR UPDATE`
  })

  const fixedWindow: RateLimiter.RateLimiterStore["Service"]["fixedWindow"] = (options) =>
    Effect.gen(function*() {
      const now = yield* Clock.currentTimeMillis
      const keyHash = hashKey(options.key)
      const refillMillis = Duration.toMillis(options.refillRate)

      yield* sql`
        INSERT INTO ratelimit.counters (key_hash, count, expires_at)
        VALUES (${keyHash}, 0, ${new Date(now)})
        ON CONFLICT (key_hash) DO NOTHING`
      const stored = yield* lockCounter(keyHash)

      // An expired counter starts again from zero.
      let count = stored.count
      let expiresAt = stored.expiresAt.getTime()
      if (expiresAt <= now) {
        count = 0
        expiresAt = now
      }
      if (options.limit !== undefined && count + options.tokens > options.limit) {
        return [count + options.tokens, expiresAt - now] as const
      }
      count += options.tokens
      if (options.limit === undefined) {
        expiresAt += refillMillis * options.tokens
      } else if (expiresAt === now && options.tokens > 0) {
        // A capped window opens on its first admission and lasts the full window.
        expiresAt = now + refillMillis * options.limit
      }
      yield* sql`
        UPDATE ratelimit.counters SET count = ${count}, expires_at = ${new Date(expiresAt)}
        WHERE key_hash = ${keyHash}`
      return [count, expiresAt - now] as const
    }).pipe(
      withGlobal("mq_ctx_ratelimit"),
      Effect.provideService(SqlClient.SqlClient, sql),
      Effect.mapError(storeError("fixedWindow"))
    )

  return RateLimiter.RateLimiterStore.of({
    fixedWindow,
    tokenBucket: () => unsupported("token-bucket"),
    adaptiveConsume: () => unsupported("adaptive limiting"),
    adaptiveFeedback: () => unsupported("adaptive limiting")
  })
})

/** Effect's `RateLimiter` on the Postgres store. Needs `SqlClient` (`mq_app`). */
export const RateLimiterLive = RateLimiter.layer.pipe(
  Layer.provide(Layer.effect(RateLimiter.RateLimiterStore, makePgRateLimiterStore))
)
