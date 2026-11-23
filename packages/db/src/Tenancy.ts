import type { OrganisationId } from "@mequest/contract"
import { Context, Effect } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import type { ContextRole } from "./Roles.ts"

export interface TenantScope {
  readonly organisationId: OrganisationId
  readonly role: ContextRole
}

/** The tenant scope the current fiber is running in, if any. */
const ActiveScope = Context.Reference<TenantScope | undefined>("mq/db/ActiveTenantScope", {
  defaultValue: () => undefined
})

const setRole = (sql: SqlClient.SqlClient, role: ContextRole) => sql`SET LOCAL ROLE ${sql(role)}`

/**
 * Runs `self` as `role` with row-level security scoped to `organisationId`
 * (ADR-0012).
 *
 * Opens a transaction, then sets `app.organisation_id` with
 * `set_config(…, true)` and `SET LOCAL ROLE`. Both are transaction-local, so
 * nothing survives on the pooled connection, which Neon's transaction-mode
 * pooler requires.
 *
 * Nesting is allowed for the same organisation, so one context can call
 * another inside a transaction: the inner scope switches role and the outer
 * role is restored afterwards. Nesting for a different organisation is a
 * defect.
 */
export const withTenant = (scope: TenantScope) =>
<A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    // Read the enclosing scope here; only `self` runs inside the new one.
    const active = yield* ActiveScope
    const scoped = self.pipe(Effect.provideService(ActiveScope, scope))

    if (active !== undefined) {
      if (active.organisationId !== scope.organisationId) {
        return yield* Effect.die(
          new Error(`withTenant: cannot nest organisation ${scope.organisationId} inside ${active.organisationId}`)
        )
      }
      return yield* setRole(sql, scope.role).pipe(
        Effect.andThen(scoped),
        Effect.ensuring(Effect.ignore(setRole(sql, active.role)))
      )
    }

    return yield* sql.withTransaction(
      sql`SELECT set_config('app.organisation_id', ${scope.organisationId}, true)`.pipe(
        Effect.andThen(setRole(sql, scope.role)),
        Effect.andThen(scoped)
      )
    )
  }).pipe(
    Effect.withSpan("withTenant", {
      attributes: { "mq.organisation_id": scope.organisationId, "mq.db.role": scope.role }
    })
  )
