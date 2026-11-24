import { BunHttpServer } from "@effect/platform-bun"
import { Mailbox, Mailer } from "@mequest/contexts/notifications"
import { TestDatabase } from "@mequest/db/testing"
import { ConfigProvider, Layer } from "effect"
import { HttpLive } from "../src/Http.ts"

/** Settings the server reads from `Config`, with test-only values. */
const TestConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ IDENTITY_CODE_SECRET: "test-only-identity-code-secret" })
)

/**
 * The whole API on a Bun test server, against this test file's own database
 * clone (ADR-0026). Outgoing email lands in `Mailbox`. `HttpClient` and
 * `HttpApiClient.make` reach the server; `TestDatabase` gives the schema owner
 * for fixtures.
 */
export const TestServer = HttpLive.pipe(
  Layer.provideMerge(BunHttpServer.layerTest),
  Layer.provide(Mailer.layerMailbox),
  Layer.provideMerge(Mailbox.layer),
  Layer.provideMerge(TestDatabase.layer),
  Layer.provide(TestConfig)
)
