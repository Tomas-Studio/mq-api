import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { OrganisationId } from "../src/index.ts"

describe("OrganisationId", () => {
  const decode = Schema.decodeUnknownExit(OrganisationId)

  it("accepts a UUID", () => {
    expect(decode("7d444840-9dc0-11d1-b245-5ffdce74fad2")._tag).toBe("Success")
  })

  it("rejects anything else", () => {
    expect(decode("acme")._tag).toBe("Failure")
    expect(decode(42)._tag).toBe("Failure")
  })
})
