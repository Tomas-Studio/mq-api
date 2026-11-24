import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AppRole, contextRoles } from "./Roles.ts"

export interface RlsViolation {
  readonly subject: string
  readonly problem: string
}

/** Schemas that hold no tenant data. Every other non-system schema belongs to a context. */
const nonTenantSchemas = ["public", "tenancy"]

/**
 * Tables in a context schema that are deliberately global (no RLS). Each entry
 * needs an ADR reference.
 */
const globalTables: ReadonlyArray<string> = [
  // Identities are global; memberships are scoped (ADR-0012, ADR-0014).
  "identity.people",
  "identity.email_codes",
  "identity.sessions",
  // Rate-limit counters, keyed by hash (ADR-0029).
  "ratelimit.counters"
]

/** The tenant root carries its id in `id`, not `organisation_id`. */
const tenantRootTables = ["org.organisations"]

/**
 * Checks the invariants ADR-0012 depends on. Run in CI against every
 * migrated database; an empty result means the invariants hold:
 *
 * - no runtime role is a superuser or can bypass RLS;
 * - every table in a context schema has RLS enabled and forced, with a policy;
 * - every such table scopes rows by a NOT NULL `organisation_id`, unless it is
 *   the tenant root.
 */
export const findRlsViolations = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const violations: Array<RlsViolation> = []

  const runtimeRoles = [AppRole, ...contextRoles]
  const roles = yield* sql<{ readonly rolname: string; readonly rolsuper: boolean; readonly rolbypassrls: boolean }>`
    SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ${sql.in(runtimeRoles)}`
  for (const role of runtimeRoles) {
    const found = roles.find((row) => row.rolname === role)
    if (found === undefined) violations.push({ subject: role, problem: "role is missing" })
    else if (found.rolsuper) violations.push({ subject: role, problem: "role is a superuser" })
    else if (found.rolbypassrls) violations.push({ subject: role, problem: "role can bypass RLS" })
  }

  const tables = yield* sql<{
    readonly name: string
    readonly rls: boolean
    readonly forced: boolean
    readonly policies: number
    readonly organisationIdNotNull: boolean | null
  }>`
    SELECT
      n.nspname || '.' || c.relname AS name,
      c.relrowsecurity AS rls,
      c.relforcerowsecurity AS forced,
      (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
      (SELECT a.attnotnull FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organisation_id' AND NOT a.attisdropped) AS "organisationIdNotNull"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ${sql.in(nonTenantSchemas)}
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\\_%'
    ORDER BY 1`

  for (const table of tables) {
    if (globalTables.includes(table.name)) continue
    if (!table.rls) violations.push({ subject: table.name, problem: "RLS is not enabled" })
    if (!table.forced) violations.push({ subject: table.name, problem: "RLS is not forced" })
    if (table.policies === 0) violations.push({ subject: table.name, problem: "no RLS policy" })
    if (!tenantRootTables.includes(table.name) && table.organisationIdNotNull !== true) {
      violations.push({ subject: table.name, problem: "no NOT NULL organisation_id column" })
    }
  }

  return violations
}).pipe(Effect.withSpan("findRlsViolations"))
