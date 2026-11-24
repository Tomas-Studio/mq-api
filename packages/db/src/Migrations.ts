import { PgMigrator } from "@effect/sql-pg"
import roles from "./migrations/0001_roles.ts"
import organisations from "./migrations/0002_organisations.ts"
import programmes from "./migrations/0003_programmes.ts"
import identity from "./migrations/0004_identity.ts"

/** Keyed `<id>_<name>`; applied in id order. Never edit or reorder an applied migration. */
export const migrations = {
  "0001_roles": roles,
  "0002_organisations": organisations,
  "0003_programmes": programmes,
  "0004_identity": identity
}

/**
 * Applies pending migrations as the connected role (`mq_migrator` in deployed
 * environments, over a direct connection). Each run is one transaction.
 */
export const runMigrations = PgMigrator.run({
  loader: PgMigrator.fromRecord(migrations),
  table: "mq_migrations"
})
