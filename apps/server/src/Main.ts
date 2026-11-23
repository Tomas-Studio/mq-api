import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Config, Layer } from "effect"
import { HttpLive } from "./Http.ts"

const ServerLive = BunHttpServer.layerConfig({
  port: Config.Port("PORT").pipe(Config.withDefault(8080))
})

Layer.launch(HttpLive.pipe(Layer.provide(ServerLive))).pipe(BunRuntime.runMain)
