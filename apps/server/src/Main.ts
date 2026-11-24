import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Mailer } from "@mequest/contexts/notifications"
import { DatabaseLive } from "@mequest/db"
import { Config, Effect, Layer } from "effect"
import { HttpLive } from "./Http.ts"

const ServerLive = BunHttpServer.layerConfig({
  port: Config.Port("PORT").pipe(Config.withDefault(8080))
})

// The Resend transport is still to come (architecture §11). Until then the only
// transport is the development log, which writes sign-in codes to the log, so
// it must be chosen explicitly with MAIL_TRANSPORT=log.
const MailerLive = Layer.unwrap(
  Effect.gen(function*() {
    const transport = yield* Config.String("MAIL_TRANSPORT")
    if (transport === "log") return Mailer.layerLog
    return yield* Effect.die(new Error(`MAIL_TRANSPORT "${transport}" is not supported; only "log" exists so far`))
  })
)

Layer.launch(HttpLive.pipe(Layer.provide([ServerLive, DatabaseLive, MailerLive]))).pipe(BunRuntime.runMain)
