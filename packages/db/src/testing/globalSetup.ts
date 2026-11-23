import { BunServices } from "@effect/platform-bun"
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import type { TestProject } from "vitest/node"
import { runMigrations } from "../Migrations.ts"
import { AppRole, SystemRole } from "../Roles.ts"
import { databaseUrl, TestRolePassword, uniqueDatabaseName } from "./urls.ts"

declare module "vitest" {
  export interface ProvidedContext {
    readonly mqAdminUrl: string
    readonly mqTemplateDatabase: string
  }
}

const runAs = (url: string, statement: string) =>
  SqlClient.SqlClient.use((sql) => sql.unsafe(statement)).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url), applicationName: "mq-api/test-setup" }))
  )

// Migrations, roles and RLS are applied once per run to a template database.
// Each test file clones it (`TestDatabase.layer`), which takes milliseconds.
const prepareTemplate = (adminUrl: string, template: string) =>
  Effect.gen(function*() {
    yield* runAs(adminUrl, `CREATE DATABASE ${template}`)
    yield* runMigrations.pipe(
      Effect.andThen(
        SqlClient.SqlClient.use((sql) =>
          Effect.all([
            sql.unsafe(`ALTER ROLE ${AppRole} WITH PASSWORD '${TestRolePassword}'`),
            sql.unsafe(`ALTER ROLE ${SystemRole} WITH PASSWORD '${TestRolePassword}'`)
          ], { discard: true })
        )
      ),
      Effect.provide(Layer.mergeAll(
        PgClient.layer({ url: Redacted.make(databaseUrl(adminUrl, { database: template })) }),
        BunServices.layer
      ))
    )
  })

const startContainer = async (): Promise<{ readonly url: string; readonly stop: () => Promise<void> }> => {
  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql")
    const container = await new PostgreSqlContainer("postgres:18-alpine").start()
    return {
      url: container.getConnectionUri(),
      stop: async () => {
        await container.stop()
      }
    }
  } catch (cause) {
    throw new Error(
      "Integration tests need Postgres 16 or later. Set TEST_DATABASE_URL to an admin connection string " +
        "for a disposable server, or start Docker so Testcontainers can run one.",
      { cause }
    )
  }
}

export default async function setup(project: TestProject) {
  const configured = process.env["TEST_DATABASE_URL"]
  const server = configured !== undefined && configured !== ""
    ? { url: configured, stop: async () => {} }
    : await startContainer()

  const template = uniqueDatabaseName("mq_test_template")
  await Effect.runPromise(prepareTemplate(server.url, template))

  project.provide("mqAdminUrl", server.url)
  project.provide("mqTemplateDatabase", template)

  return async () => {
    await Effect.runPromise(runAs(server.url, `DROP DATABASE IF EXISTS ${template} WITH (FORCE)`))
    await server.stop()
  }
}
