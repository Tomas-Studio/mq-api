import { Context } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api"
import type { SessionId } from "../Ids.ts"
import { Unauthorized } from "./Errors.ts"
import type { Person } from "./Person.ts"

/** The signed-in person, provided by `Authentication`. */
export class CurrentPerson extends Context.Service<CurrentPerson, Person>()("mq/CurrentPerson") {}

/** The session the request arrived with, provided by `Authentication`. */
export class CurrentSession
  extends Context.Service<CurrentSession, { readonly id: SessionId }>()("mq/CurrentSession")
{}

/**
 * The web session cookie (ADR-0015): httpOnly and Secure, and first-party on
 * every web domain because Front Door serves `/api` on each of them.
 */
export const SessionCookie = HttpApiSecurity.apiKey({ in: "cookie", key: "mq_session" })

/**
 * Resolves the session from the `mq_session` cookie (web) or an
 * `Authorization: Bearer` token (mobile), in that order (ADR-0015).
 */
export class Authentication extends HttpApiMiddleware.Service<Authentication, {
  provides: CurrentPerson | CurrentSession
}>()("mq/Authentication", {
  security: { cookie: SessionCookie, bearer: HttpApiSecurity.bearer },
  error: Unauthorized
}) {}
