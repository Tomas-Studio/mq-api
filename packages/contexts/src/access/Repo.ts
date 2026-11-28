import { OrganisationId, OrganisationRole, PersonId, ProgrammeId, ProgrammeRole } from "@mequest/contract"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

// Queries on the access schema, run as mq_ctx_access inside `withPerson` or
// `withTenant`. RLS already limits the rows to that scope; each query names the
// person, and the organisation where it has one, as well.

const PersonInOrganisation = Schema.Struct({ organisationId: OrganisationId, personId: PersonId })

const OrganisationOfPerson = Schema.Struct({
  organisationId: OrganisationId,
  role: Schema.NullOr(OrganisationRole)
})

const ProgrammeRoleRow = Schema.Struct({ programmeId: ProgrammeId, role: ProgrammeRole })

export const makeRepo = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  /**
   * Person scope: every organisation the person belongs to, through an
   * organisation membership or a programme role, with the membership role if
   * there is one.
   */
  const organisationsOf = SqlSchema.findAll({
    Request: PersonId,
    Result: OrganisationOfPerson,
    execute: (personId) =>
      sql`
        SELECT belongs.organisation_id AS "organisationId", membership.role
        FROM (
          SELECT organisation_id FROM access.org_memberships WHERE person_id = ${personId}
          UNION
          SELECT organisation_id FROM access.programme_roles WHERE person_id = ${personId}
        ) belongs
        LEFT JOIN access.org_memberships membership
          ON membership.organisation_id = belongs.organisation_id AND membership.person_id = ${personId}`
  })

  /** Tenant scope: whether the person belongs to the organisation. */
  const isMember = SqlSchema.findOne({
    Request: PersonInOrganisation,
    Result: Schema.Struct({ member: Schema.Boolean }),
    execute: ({ organisationId, personId }) =>
      sql`
        SELECT
          EXISTS (
            SELECT FROM access.org_memberships
            WHERE organisation_id = ${organisationId} AND person_id = ${personId}
          ) OR EXISTS (
            SELECT FROM access.programme_roles
            WHERE organisation_id = ${organisationId} AND person_id = ${personId}
          ) AS member`
  })

  /** Tenant scope: the person's programme roles in the organisation, sorted by role. */
  const programmeRolesOf = SqlSchema.findAll({
    Request: PersonInOrganisation,
    Result: ProgrammeRoleRow,
    execute: ({ organisationId, personId }) =>
      sql`
        SELECT programme_id AS "programmeId", role
        FROM access.programme_roles
        WHERE organisation_id = ${organisationId} AND person_id = ${personId}
        ORDER BY role`
  })

  return { organisationsOf, isMember, programmeRolesOf } as const
})
