import { BunHttpServer } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { MqApi } from "@mequest/contract"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { HttpLive } from "../src/Http.ts"

const TestServer = HttpLive.pipe(Layer.provideMerge(BunHttpServer.layerTest))

describe("GET /api/health", () => {
  it.effect("answers ok through the generated client", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiClient.make(MqApi)
      expect(yield* client.system.health()).toEqual({ status: "ok" })
    }).pipe(Effect.provide(TestServer)))

  it.effect("is reachable without credentials", () =>
    Effect.gen(function*() {
      const response = yield* HttpClient.get("/api/health")
      expect(response.status).toBe(200)
    }).pipe(Effect.provide(TestServer)))
})
