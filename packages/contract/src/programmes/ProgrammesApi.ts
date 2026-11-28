import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Public } from "../Annotations.ts"
import { Authentication } from "../identity/Security.ts"
import { OrganisationId } from "../Ids.ts"
import { OrganisationScope } from "../organisations/Scope.ts"
import { MyProgramme } from "./Programme.ts"

/** Programmes in the current organisation (ADR-0030). */
export const ProgrammesApi = HttpApiGroup.make("programmes")
  .add(
    // The programmes the person holds a role in, sorted by name. Only
    // membership is checked, so it needs no capability.
    HttpApiEndpoint.get("listMine", "/organisations/:organisationId/me/programmes", {
      params: { organisationId: OrganisationId },
      success: Schema.Array(MyProgramme)
    })
      .middleware(OrganisationScope)
      .middleware(Authentication)
      .annotate(Public, true)
  )
