import { CurrentOrganisation, CurrentPerson, MqApi } from "@mequest/contract"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Programmes } from "./Service.ts"

export const ProgrammesHttp = HttpApiBuilder.group(MqApi, "programmes", (handlers) =>
  Effect.gen(function*() {
    const programmes = yield* Programmes
    return handlers.handle("listMine", () =>
      Effect.gen(function*() {
        const organisation = yield* CurrentOrganisation
        const person = yield* CurrentPerson
        return yield* programmes.listMine(organisation.id, person.id)
      }))
  }))
