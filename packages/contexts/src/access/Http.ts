import {
  CurrentOrganisation,
  CurrentPerson,
  OrganisationId,
  OrganisationNotFound,
  OrganisationScope
} from "@mequest/contract"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter } from "effect/http"
import { Access } from "./Service.ts"

const decodeOrganisationId = Schema.decodeUnknownOption(OrganisationId)

/**
 * Resolves `CurrentOrganisation` from `:organisationId` in the path (ADR-0030).
 * A malformed id, an unknown organisation and one the person does not belong
 * to all fail with `OrganisationNotFound`.
 */
export const OrganisationScopeLive = Layer.effect(
  OrganisationScope,
  Effect.gen(function*() {
    const access = yield* Access
    return OrganisationScope.of((httpEffect) =>
      Effect.gen(function*() {
        const person = yield* CurrentPerson
        const params = yield* HttpRouter.params
        const organisationId = decodeOrganisationId(params.organisationId)
        if (Option.isNone(organisationId) || !(yield* access.isMember(organisationId.value, person.id))) {
          return yield* new OrganisationNotFound()
        }
        return yield* httpEffect.pipe(Effect.provideService(CurrentOrganisation, { id: organisationId.value }))
      })
    )
  })
)
