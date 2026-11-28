import { Context } from "effect"
import { HttpApiMiddleware } from "effect/http-api"
import type { CurrentPerson } from "../identity/Security.ts"
import type { OrganisationId } from "../Ids.ts"
import { OrganisationNotFound } from "./Errors.ts"

/** The organisation the request is for, provided by `OrganisationScope`. */
export class CurrentOrganisation extends Context.Service<CurrentOrganisation, {
  readonly id: OrganisationId
}>()("mq/CurrentOrganisation") {}

/**
 * Reads `:organisationId` from the path, checks that the signed-in person
 * belongs to that organisation, and provides `CurrentOrganisation` (ADR-0030).
 *
 * Needs `CurrentPerson`, so add it before `Authentication`: middleware added
 * later runs first.
 */
export class OrganisationScope extends HttpApiMiddleware.Service<OrganisationScope, {
  provides: CurrentOrganisation
  requires: CurrentPerson
}>()("mq/OrganisationScope", {
  error: OrganisationNotFound
}) {}
