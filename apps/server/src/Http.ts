import { AuthenticationLive, IdentityHttp, IdentityLive } from "@mequest/contexts/identity"
import { MqApi } from "@mequest/contract"
import { RateLimiterLive } from "@mequest/db"
import { Config, Effect, Layer, Result } from "effect"
import { HttpMiddleware, HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { IpNetwork } from "effect/net"
import { SystemHandlers } from "./system/SystemHandlers.ts"

/**
 * The API with every group's handlers and middleware, served on whichever
 * HttpServer is provided. Needs `SqlClient`, `Mailer` and the identity config.
 */
export const ApiLive = HttpApiBuilder.layer(MqApi).pipe(
  Layer.provide([SystemHandlers, IdentityHttp]),
  Layer.provide(AuthenticationLive),
  Layer.provide([IdentityLive, RateLimiterLive])
)

/**
 * Proxies whose `X-Forwarded-For` is believed, as comma-separated networks
 * (`10.0.0.0/8, ::1/128`). Empty by default: the client address is then the
 * transport peer. Front Door and App Service values come from spike S1 (ADR-0029).
 */
const TrustedProxies = Effect.gen(function*() {
  const value = yield* Config.String("TRUSTED_PROXIES").pipe(Config.withDefault(""))
  const networks: Array<IpNetwork.IpNetwork> = []
  for (const entry of value.split(",").map((part) => part.trim()).filter((part) => part !== "")) {
    const network = IpNetwork.fromString(entry)
    if (Result.isFailure(network)) {
      return yield* Effect.die(new Error(`TRUSTED_PROXIES: "${entry}" is not an IP network`))
    }
    networks.push(network.success)
  }
  return networks
})

export const HttpLive = Layer.unwrap(
  Effect.gen(function*() {
    const trustedProxies = yield* TrustedProxies
    return HttpRouter.serve(ApiLive, { middleware: HttpMiddleware.xForwardedHeaders({ trustedProxies }) })
  })
)
