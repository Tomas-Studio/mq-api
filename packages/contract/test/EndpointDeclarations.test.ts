import { describe, expect, it } from "@effect/vitest"
import { Context } from "effect"
import { HttpApi } from "effect/http-api"
import { Authentication, MqApi, OrganisationScope, Public } from "../src/index.ts"

const endpoints = () => {
  const found: Array<{
    readonly name: string
    readonly path: string
    readonly isPublic: boolean
    readonly needsSession: boolean
    readonly organisationScoped: boolean
  }> = []
  HttpApi.reflect(MqApi, {
    onGroup: () => {},
    onEndpoint: ({ endpoint, group, mergedAnnotations }) => {
      found.push({
        name: `${group.identifier}.${endpoint.identifier}`,
        path: endpoint.path,
        isPublic: Context.getOrElse(mergedAnnotations, Public, () => false),
        needsSession: endpoint.middlewares.has(Authentication),
        organisationScoped: endpoint.middlewares.has(OrganisationScope)
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
      needsSession: false,
      organisationScoped: false
    })
  })

  // ADR-0015. Grows as endpoints are added; a change here is a deliberate decision.
  it("asks for a session everywhere except health and sign-in", () => {
    const open = endpoints().filter((endpoint) => !endpoint.needsSession).map((endpoint) => endpoint.name)
    expect(open.sort()).toEqual(["identity.requestEmailCode", "identity.verifyEmailCode", "system.health"])
  })

  // ADR-0030: the organisation comes from the path, and OrganisationScope is
  // what reads it, so the two always go together.
  it("scopes an endpoint to an organisation exactly when its path names one", () => {
    const prefix = "/api/organisations/:organisationId"
    const mismatched = endpoints()
      .filter((endpoint) =>
        endpoint.organisationScoped !== (endpoint.path === prefix || endpoint.path.startsWith(`${prefix}/`))
      )
      .map((endpoint) => endpoint.name)
    expect(mismatched).toEqual([])
  })

  // OrganisationScope reads CurrentPerson, so Authentication must wrap it.
  it("asks for a session on every organisation-scoped endpoint", () => {
    const withoutSession = endpoints()
      .filter((endpoint) => endpoint.organisationScoped && !endpoint.needsSession)
      .map((endpoint) => endpoint.name)
    expect(withoutSession).toEqual([])
  })

  it("has organisation-scoped endpoints to check", () => {
    expect(endpoints().filter((endpoint) => endpoint.organisationScoped).map((endpoint) => endpoint.name).sort())
      .toEqual(["organisations.get", "programmes.listMine"])
  })
})
