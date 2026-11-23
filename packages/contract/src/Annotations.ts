import { Context } from "effect"

/**
 * Marks an endpoint (or a whole group) as reachable without a capability check.
 * Every other endpoint declares the capability it requires (ADR-0016).
 */
export const Public = Context.Reference<boolean>("mq/contract/Public", {
  defaultValue: () => false
})
