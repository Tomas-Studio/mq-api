import { BunHttpServer } from "@effect/platform-bun"
import { Mailbox, Mailer } from "@mequest/contexts/notifications"
import { TestDatabase } from "@mequest/db/testing"
import { ConfigProvider, Layer } from "effect"
import { HttpClientRequest } from "effect/http"
import { HttpLive } from "../src/Http.ts"

/**
 * Settings the server reads from `Config`, with test-only values. The test
 * client connects over loopback, which is trusted as a proxy, so tests choose
 * each request's client address with `X-Forwarded-For` (ADR-0029).
 */
const testConfig = {
  IDENTITY_CODE_SECRET: "test-only-identity-code-secret",
  TRUSTED_PROXIES: "127.0.0.0/8, ::1/128"
}

/**
 * The whole API on a Bun test server, against a database clone of its own
 * (ADR-0026). Outgoing email lands in `Mailbox`. `HttpClient` and
 * `HttpApiClient.make` reach the server; `TestDatabase` gives the schema owner
 * for fixtures. `config` overrides the test settings.
 */
export const makeTestServer = (config: Partial<typeof testConfig> = {}) =>
  HttpLive.pipe(
    Layer.provideMerge(BunHttpServer.layerTest),
    Layer.provide(Mailer.layerMailbox),
    Layer.provideMerge(Mailbox.layer),
    Layer.provideMerge(TestDatabase.layer),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ ...testConfig, ...config })))
  )

export const TestServer = makeTestServer()

let addresses = 0

/** A client address not used before in this test file. */
export const nextClientAddress = () => {
  addresses += 1
  return `10.${(addresses >> 16) & 255}.${(addresses >> 8) & 255}.${addresses & 255}`
}

/** Sends the request as if from `address`, the way a trusted proxy forwards it. */
export const fromAddress = (address: string) => HttpClientRequest.setHeader("x-forwarded-for", address)

/** Sends each request from a new client address, so per-address limits never apply. */
export const fromNewAddress = (request: HttpClientRequest.HttpClientRequest) =>
  fromAddress(nextClientAddress())(request)
