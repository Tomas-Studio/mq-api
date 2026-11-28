import type { OrganisationId, PersonId } from "@mequest/contract"
import { Context, Effect } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import type { ContextRole } from "./Roles.ts"

export interface TenantScope {
  readonly organisationId: OrganisationId
  readonly role: ContextRole
}

export interface PersonScope {
  readonly personId: PersonId
  readonly role: ContextRole
}

/**
 * The scope the current fiber is running in, if any. `organisationId` is
 * undefined in a top-level `withGlobal` and in `withPerson`; a `withGlobal`
 * nested in a tenant scope keeps the tenant's.
 */
interface ActiveScope {
  readonly kind: "tenant" | "global" | "person"
  readonly organisationId: OrganisationId | undefined
  readonly role: ContextRole
}

const ActiveScope = Context.Reference<ActiveScope | undefined>("mq/db/ActiveScope", {
  defaultValue: () => undefined
})

const describe = (scope: ActiveScope) =>
  scope.kind === "person" ? "a person scope" : (scope.organisationId ?? "a global scope")

const setRole = (sql: SqlClient.SqlClient, role: ContextRole) => sql`SET LOCAL ROLE ${sql(role)}`

/**
 * Inside an open scope: switches to `role` for `self`, then restores the
 * enclosing role, even if `self` fails.
 */
const switchRole = <A, E, R>(
  sql: SqlClient.SqlClient,
  active: ActiveScope,
  role: ContextRole,
  self: Effect.Effect<A, E, R>
) =>
  setRole(sql, role).pipe(
    Effect.andThen(self),
    Effect.ensuring(Effect.ignore(setRole(sql, active.role)))
  )

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
 * role is restored afterwards. Nesting for a different organisation, or inside
 * a top-level `withGlobal` or a `withPerson`, is a defect.
 */
export const withTenant = (scope: TenantScope) =>
<A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    // Read the enclosing scope here; only `self` runs inside the new one.
    const active = yield* ActiveScope
    const scoped = self.pipe(Effect.provideService(ActiveScope, { kind: "tenant", ...scope }))

    if (active !== undefined) {
      if (active.organisationId !== scope.organisationId) {
        return yield* Effect.die(
          new Error(`withTenant: cannot nest organisation ${scope.organisationId} inside ${describe(active)}`)
        )
      }
      return yield* switchRole(sql, active, scope.role, scoped)
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

/**
 * Runs `self` as `role` in a transaction, for a context whose tables are global
 * rather than tenant-scoped (identity, ADR-0012). No organisation is set, so
 * any tenant table the role could reach returns nothing.
 *
 * Inside a tenant scope it switches role and restores the enclosing role
 * afterwards, keeping the enclosing organisation. Inside `withPerson` it is a
 * defect (ADR-0031).
 */
export const withGlobal = (role: ContextRole) =>
<A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const active = yield* ActiveScope

    if (active !== undefined) {
      if (active.kind === "person") {
        return yield* Effect.die(new Error(`withGlobal: cannot nest inside ${describe(active)}`))
      }
      return yield* switchRole(sql, active, role, self.pipe(Effect.provideService(ActiveScope, { ...active, role })))
    }
    const scoped = self.pipe(
      Effect.provideService(ActiveScope, { kind: "global", organisationId: undefined, role })
    )
    return yield* sql.withTransaction(setRole(sql, role).pipe(Effect.andThen(scoped)))
  }).pipe(Effect.withSpan("withGlobal", { attributes: { "mq.db.role": role } }))

/**
 * Runs `self` as `role` with `app.person_id` set and no organisation, so tables
 * with an `own_rows` policy show the rows that name this person in every
 * organisation, and nothing else (ADR-0031). Those policies are SELECT-only:
 * a person scope cannot write.
 *
 * Opens a transaction of its own and does not nest with any other scope, in
 * either direction.
 */
export const withPerson = (scope: PersonScope) =>
<A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, R | SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const active = yield* ActiveScope
    if (active !== undefined) {
      return yield* Effect.die(new Error(`withPerson: cannot nest inside ${describe(active)}`))
    }
    const scoped = self.pipe(
      Effect.provideService(ActiveScope, { kind: "person", organisationId: undefined, role: scope.role })
    )
    return yield* sql.withTransaction(
      sql`SELECT set_config('app.person_id', ${scope.personId}, true)`.pipe(
        Effect.andThen(setRole(sql, scope.role)),
        Effect.andThen(scoped)
      )
    )
  }).pipe(Effect.withSpan("withPerson", { attributes: { "mq.db.role": scope.role } }))
