import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Public } from "../Annotations.ts"

export const Health = Schema.Struct({
  status: Schema.Literal("ok")
})
export type Health = typeof Health.Type

/** Liveness for App Service health checks and Front Door probes. Never touches the database. */
export const SystemApi = HttpApiGroup.make("system")
  .add(HttpApiEndpoint.get("health", "/health", { success: Health }))
  .annotate(Public, true)
