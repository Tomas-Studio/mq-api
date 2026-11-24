import { describe, expect, it } from "@effect/vitest"
import { Context } from "effect"
import { HttpApi } from "effect/http-api"
import { Authentication, MqApi, Public } from "../src/index.ts"

const endpoints = () => {
  const found: Array<{
    readonly name: string
    readonly path: string
    readonly isPublic: boolean
    readonly needsSession: boolean
  }> = []
  HttpApi.reflect(MqApi, {
    onGroup: () => {},
    onEndpoint: ({ endpoint, group, mergedAnnotations }) => {
      found.push({
        name: `${group.identifier}.${endpoint.identifier}`,
        path: endpoint.path,
        isPublic: Context.getOrElse(mergedAnnotations, Public, () => false),
        needsSession: endpoint.middlewares.has(Authentication)
      })
    }
  })
  return found
}

describe("MqApi", () => {
  // ADR-0016: an endpoint either declares the capability it requires or is
  // explicitly public. `Requires` joins this check with the access context.
  it("declares every endpoint public or capability-gated", () => {
    const undeclared = endpoints().filter((endpoint) => !endpoint.isPublic).map((endpoint) => endpoint.name)
    expect(undeclared).toEqual([])
  })

  // Front Door routes `/api/*` on every web domain to the server (ADR-0025).
  it("serves every endpoint under /api", () => {
    const outside = endpoints().filter((endpoint) => !endpoint.path.startsWith("/api/")).map((endpoint) =>
      endpoint.name
    )
    expect(outside).toEqual([])
  })

  it("exposes a public health check", () => {
    expect(endpoints()).toContainEqual({
      name: "system.health",
      path: "/api/health",
      isPublic: true,
      needsSession: false
    })
  })

  // ADR-0015. Grows as endpoints are added; a change here is a deliberate decision.
  it("asks for a session everywhere except health and sign-in", () => {
    const open = endpoints().filter((endpoint) => !endpoint.needsSession).map((endpoint) => endpoint.name)
    expect(open.sort()).toEqual(["identity.requestEmailCode", "identity.verifyEmailCode", "system.health"])
  })
})
