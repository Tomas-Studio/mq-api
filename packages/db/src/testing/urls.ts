/**
 * Password the test harness gives the runtime login roles. Test-only: the
 * server behind `TEST_DATABASE_URL` must be disposable, never a deployed database.
 */
export const TestRolePassword = "mq-test-only"

/** The admin connection string pointed at another database and, optionally, another role. */
export const databaseUrl = (
  adminUrl: string,
  options: { readonly database: string; readonly user?: string; readonly password?: string }
): string => {
  const url = new URL(adminUrl)
  url.pathname = `/${options.database}`
  if (options.user !== undefined) url.username = options.user
  if (options.password !== undefined) url.password = options.password
  return url.toString()
}

/** A unique, lowercase, unquoted-safe database name. */
export const uniqueDatabaseName = (prefix: string): string => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`
