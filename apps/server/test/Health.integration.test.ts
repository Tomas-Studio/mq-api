import { expect, layer } from "@effect/vitest"
import { MqApi } from "@mequest/contract"
import { Effect } from "effect"
import { HttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { TestServer } from "./TestServer.ts"

layer(TestServer, { timeout: "60 seconds" })("GET /api/health", (it) => {
  it.effect("answers ok through the generated client", () =>
    Effect.gen(function*() {
      const client = yield* HttpApiClient.make(MqApi)
      expect(yield* client.system.health()).toEqual({ status: "ok" })
    }))

  it.effect("is reachable without credentials", () =>
    Effect.gen(function*() {
      const response = yield* HttpClient.get("/api/health")
      expect(response.status).toBe(200)
    }))

  it.effect("serves nothing outside /api", () =>
    Effect.gen(function*() {
      const response = yield* HttpClient.get("/health")
      expect(response.status).toBe(404)
    }))
})
