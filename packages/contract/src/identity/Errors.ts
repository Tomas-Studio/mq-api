import { Schema } from "effect"

/**
 * The email code was not accepted. An unknown email, a suspended person and a
 * wrong code all report `incorrect`, so the answer reveals nothing about who
 * has an account.
 */
export class InvalidCode extends Schema.TaggedError<InvalidCode>()("InvalidCode", {
  reason: Schema.Literals(["incorrect", "expired", "exhausted"])
}, { httpApiStatus: 400 }) {}

/** No valid session: missing, unknown, expired or signed out, or the person is suspended. */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}, { httpApiStatus: 401 }) {}
