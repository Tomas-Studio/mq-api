import { Context } from "effect"

/**
 * Marks an endpoint (or a whole group) as reachable without a capability check.
 * Every other endpoint declares the capability it requires (ADR-0016).
 *
 * Public says nothing about sign-in: an endpoint that needs a session declares
 * the `Authentication` middleware as well (`/me`, sign-out).
 */
export const Public = Context.Reference<boolean>("mq/contract/Public", {
  defaultValue: () => false
})
