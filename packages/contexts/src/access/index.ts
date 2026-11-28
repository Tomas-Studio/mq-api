export { OrganisationScopeLive } from "./Http.ts"
export { Access, type OrganisationOfPerson, type ProgrammeRoleOfPerson } from "./Service.ts"

import { Access } from "./Service.ts"

/** Needs `SqlClient`. */
export const AccessLive = Access.layer
