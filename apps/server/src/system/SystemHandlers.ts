import { MqApi } from "@mequest/contract"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

export const SystemHandlers = HttpApiBuilder.group(
  MqApi,
  "system",
  (handlers) => handlers.handle("health", () => Effect.succeed({ status: "ok" as const }))
)
