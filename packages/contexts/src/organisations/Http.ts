import { CurrentOrganisation, CurrentPerson, MqApi, OrganisationNotFound } from "@mequest/contract"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Organisations } from "./Service.ts"

export const OrganisationsHttp = HttpApiBuilder.group(MqApi, "organisations", (handlers) =>
  Effect.gen(function*() {
    const organisations = yield* Organisations
    return handlers
      .handle("listMine", () =>
        Effect.gen(function*() {
          const person = yield* CurrentPerson
          return yield* organisations.listMine(person.id)
        }))
      .handle("get", () =>
        Effect.gen(function*() {
          const { id } = yield* CurrentOrganisation
          // OrganisationScope has checked the membership; the row can only be
          // missing if the organisation was deleted since.
          const found = yield* organisations.get(id)
          if (Option.isNone(found)) return yield* new OrganisationNotFound()
          return found.value
        }))
  }))
