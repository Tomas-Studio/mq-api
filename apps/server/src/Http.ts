import { MqApi } from "@mequest/contract"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { SystemHandlers } from "./system/SystemHandlers.ts"

/** The API with every group's handlers, served on whichever HttpServer is provided. */
export const ApiLive = HttpApiBuilder.layer(MqApi).pipe(Layer.provide(SystemHandlers))

export const HttpLive = HttpRouter.serve(ApiLive)
