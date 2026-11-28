import { Schema } from "effect"
import { OrganisationRole } from "../access/Roles.ts"
import { OrganisationId } from "../Ids.ts"

export const Organisation = Schema.Struct({
  id: OrganisationId,
  /** Readable and unique, but it can change: clients keep the id (ADR-0030). */
  slug: Schema.String,
  name: Schema.String
})
export type Organisation = typeof Organisation.Type

/** An organisation the signed-in person belongs to. */
export const MyOrganisation = Schema.Struct({
  organisation: Organisation,
  /** Null when the person belongs only through roles in its programmes. */
  role: Schema.NullOr(OrganisationRole)
})
export type MyOrganisation = typeof MyOrganisation.Type
