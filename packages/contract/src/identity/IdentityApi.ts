import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Public } from "../Annotations.ts"
import { InvalidCode } from "./Errors.ts"
import { Email, EmailCode, Person, SessionTransport, SignedIn } from "./Person.ts"
import { Authentication } from "./Security.ts"

/** Email-code sign-in and the session it creates (ADR-0014, ADR-0015). */
export const IdentityApi = HttpApiGroup.make("identity")
  .add(
    // Always 202, whether or not the email belongs to anyone.
    HttpApiEndpoint.post("requestEmailCode", "/auth/email-code", {
      payload: Schema.Struct({ email: Email }),
      success: HttpApiSchema.Accepted
    }).annotate(Public, true)
  )
  .add(
    HttpApiEndpoint.post("verifyEmailCode", "/auth/email-code/verify", {
      payload: Schema.Struct({ email: Email, code: EmailCode, transport: SessionTransport }),
      success: SignedIn,
      error: InvalidCode
    }).annotate(Public, true)
  )
  .add(
    HttpApiEndpoint.post("signOut", "/auth/sign-out", { success: HttpApiSchema.NoContent })
      .middleware(Authentication)
      .annotate(Public, true)
  )
  .add(
    HttpApiEndpoint.get("me", "/me", { success: Person })
      .middleware(Authentication)
      .annotate(Public, true)
  )
