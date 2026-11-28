import { Schema } from "effect"

/**
 * A UUID as 32 lowercase hex digits with no hyphens, the only form ids take
 * on the wire and in TypeScript (ADR-0032). Any UUID version is accepted:
 * new rows are v7, legacy rows are v4.
 */
const Uuid = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/u, { expected: "a UUID as 32 lowercase hex digits" }))

export const OrganisationId = Uuid.pipe(Schema.brand("OrganisationId"))
export type OrganisationId = typeof OrganisationId.Type

export const PersonId = Uuid.pipe(Schema.brand("PersonId"))
export type PersonId = typeof PersonId.Type

export const ProgrammeId = Uuid.pipe(Schema.brand("ProgrammeId"))
export type ProgrammeId = typeof ProgrammeId.Type

export const SessionId = Uuid.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type
