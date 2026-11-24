/**
 * Database roles (ADR-0012). Runtime roles are created by migration, never in
 * the Neon Console. `mq_migrator` is the Neon project's owner role and is not
 * listed here.
 */

/** Login role of the server and worker. `NOBYPASSRLS`; holds no table grants itself. */
export const AppRole = "mq_app"

/** Login role behind `SystemSql`. `BYPASSRLS` (ADR-0013). */
export const SystemRole = "mq_system"

/**
 * One `NOLOGIN` role per context schema. `withTenant` and `withGlobal` switch to
 * it with `SET LOCAL ROLE`, so a context can only touch its own schema. `mq_app`
 * is a member with `INHERIT FALSE`: it can switch to these roles but gains none
 * of their grants without switching.
 */
export const contextRoles = ["mq_ctx_org", "mq_ctx_programmes", "mq_ctx_identity"] as const
export type ContextRole = (typeof contextRoles)[number]
