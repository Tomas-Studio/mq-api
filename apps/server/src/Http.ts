import { AuthenticationLive, IdentityHttp, IdentityLive } from "@mequest/contexts/identity"
import { MqApi } from "@mequest/contract"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { SystemHandlers } from "./system/SystemHandlers.ts"

/**
 * The API with every group's handlers and middleware, served on whichever
 * HttpServer is provided. Needs `SqlClient`, `Mailer` and the identity config.
 */
export const ApiLive = HttpApiBuilder.layer(MqApi).pipe(
  Layer.provide([SystemHandlers, IdentityHttp]),
  Layer.provide(AuthenticationLive),
  Layer.provide(IdentityLive)
)

export const HttpLive = HttpRouter.serve(ApiLive)
