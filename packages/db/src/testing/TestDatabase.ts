import { PgClient } from "@effect/sql-pg"
import { Context, Effect, Layer, Redacted } from "effect"
import { Reactivity } from "effect/reactivity"
import type { SqlClient } from "effect/sql"
import { inject } from "vitest"
import { idTypes } from "../IdTypes.ts"
import { AppRole, SystemRole } from "../Roles.ts"
import { SystemSql } from "../SystemSql.ts"
import { databaseUrl, TestRolePassword, uniqueDatabaseName } from "./urls.ts"

interface TestDatabaseShape {
  readonly name: string
  /** The schema owner. For fixtures only: it is not subject to RLS. */
  readonly owner: SqlClient.SqlClient
}

const make = Effect.gen(function*() {
  const adminUrl = inject("mqAdminUrl")
  const template = inject("mqTemplateDatabase")
  const name = uniqueDatabaseName("mq_test")

  const admin = yield* PgClient.make({ url: Redacted.make(adminUrl), maxConnections: 1 })
  yield* Effect.acquireRelease(
    admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ${template}`),
    () => Effect.orDie(admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`))
  )
  const owner = yield* PgClient.make({ url: Redacted.make(databaseUrl(adminUrl, { database: name })), types: idTypes })
  return { name, owner }
})

const roleUrl = (database: string, user: string) =>
  Redacted.make(databaseUrl(inject("mqAdminUrl"), { database, user, password: TestRolePassword }))

/**
 * A database of this test file's own, cloned from the migrated template that
 * `globalSetup.ts` prepares (ADR-0026). Provides:
 *
 * - `SqlClient` / `PgClient` as `mq_app`, exactly as the server connects;
 * - `SystemSql` as `mq_system`;
 * - `TestDatabase` with the schema owner, for fixtures.
 *
 * The database is dropped when the layer is released.
 */
export class TestDatabase extends Context.Service<TestDatabase, TestDatabaseShape>()("mq/db/testing/TestDatabase") {
  private static readonly database = Layer.effect(TestDatabase, make).pipe(Layer.provide(Reactivity.layer))

  private static readonly clients = Layer.unwrap(
    Effect.gen(function*() {
      const { name } = yield* TestDatabase
      return Layer.mergeAll(
        PgClient.layer({ url: roleUrl(name, AppRole), applicationName: "mq-api/test", types: idTypes }),
        SystemSql.layerFrom(roleUrl(name, SystemRole))
      )
    })
  )

  static readonly layer = TestDatabase.clients.pipe(Layer.provideMerge(TestDatabase.database))
}
