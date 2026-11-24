import { Schema } from "effect"

export const OrganisationId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("OrganisationId"))
export type OrganisationId = typeof OrganisationId.Type

export const PersonId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("PersonId"))
export type PersonId = typeof PersonId.Type

export const ProgrammeId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("ProgrammeId"))
export type ProgrammeId = typeof ProgrammeId.Type

export const SessionId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type
