import { Schema, SchemaTransformation } from "effect"
import { PersonId } from "../Ids.ts"

/**
 * An email address as typed by a person. Decoding trims and lower-cases it,
 * which is the form `identity.people` stores and matches on.
 */
export const Email = Schema.String.pipe(
  Schema.decode(SchemaTransformation.trim()),
  Schema.decode(SchemaTransformation.toLowerCase())
).check(Schema.isMaxLength(254), Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))

/** The six-digit sign-in code sent by email. */
export const EmailCode = Schema.String.check(Schema.isPattern(/^\d{6}$/))

export const Person = Schema.Struct({
  id: PersonId,
  email: Schema.String,
  name: Schema.String
})
export type Person = typeof Person.Type

/**
 * How the client keeps its session (ADR-0015): web takes the httpOnly
 * `mq_session` cookie; mobile takes the token and sends it as a bearer token.
 */
export const SessionTransport = Schema.Literals(["cookie", "bearer"])
export type SessionTransport = typeof SessionTransport.Type

export const SignedIn = Schema.Struct({
  person: Person,
  /** When the session ends unless it is used; each use within its second half extends it. */
  expiresAt: Schema.DateTimeUtcFromString,
  /** Present only for `transport: "bearer"`. Web clients never see the token. */
  token: Schema.optionalKey(Schema.String)
})
export type SignedIn = typeof SignedIn.Type
