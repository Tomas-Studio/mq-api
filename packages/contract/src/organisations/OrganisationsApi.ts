import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Public } from "../Annotations.ts"
import { Authentication } from "../identity/Security.ts"
import { OrganisationId } from "../Ids.ts"
import { OrganisationNotFound } from "./Errors.ts"
import { MyOrganisation, Organisation } from "./Organisation.ts"
import { OrganisationScope } from "./Scope.ts"

/**
 * The signed-in person's organisations, and the current one (ADR-0030).
 * Membership is the only check, so these need no capability.
 */
export const OrganisationsApi = HttpApiGroup.make("organisations")
  .add(
    // Sorted by name. Clients keep the chosen id and send it in the path.
    HttpApiEndpoint.get("listMine", "/me/organisations", { success: Schema.Array(MyOrganisation) })
      .middleware(Authentication)
  )
  .add(
    HttpApiEndpoint.get("get", "/organisations/:organisationId", {
      params: { organisationId: OrganisationId },
      success: Organisation,
      error: OrganisationNotFound
    })
      .middleware(OrganisationScope)
      .middleware(Authentication)
  )
  .annotate(Public, true)
