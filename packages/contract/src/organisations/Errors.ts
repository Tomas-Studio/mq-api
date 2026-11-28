import { Schema } from "effect"

/**
 * No such organisation for this person: the id is malformed, unknown, or names
 * an organisation the person does not belong to. All three answer the same, so
 * the answer does not reveal which organisations exist (ADR-0030).
 */
export class OrganisationNotFound
  extends Schema.TaggedError<OrganisationNotFound>()("OrganisationNotFound", {}, { httpApiStatus: 404 })
{}
