import { Schema } from "effect"

/**
 * A person's role in an organisation (ADR-0014). Learners usually have none:
 * they belong through their programme roles.
 */
export const OrganisationRole = Schema.Literals(["owner", "billing", "member"])
export type OrganisationRole = typeof OrganisationRole.Type

/** A person's role in a programme (ADR-0014). One person may hold several in one programme. */
export const ProgrammeRole = Schema.Literals([
  "learner",
  "lead",
  "instructor",
  "assistant",
  "viewer",
  "sponsor",
  "reviewer"
])
export type ProgrammeRole = typeof ProgrammeRole.Type
