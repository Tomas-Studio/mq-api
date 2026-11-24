export { AuthenticationLive, IdentityHttp } from "./Http.ts"
export { type AuthenticatedSession, Identity, type SignedInSession } from "./Service.ts"

import { Identity } from "./Service.ts"

/** Needs `SqlClient`, `Mailer` and `IDENTITY_CODE_SECRET`. */
export const IdentityLive = Identity.layer
