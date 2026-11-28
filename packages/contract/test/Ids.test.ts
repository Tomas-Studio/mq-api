import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { OrganisationId, PersonId, ProgrammeId, SessionId } from "../src/index.ts"

// ADR-0032: ids are UUIDs written as 32 lowercase hex digits, no hyphens. The
// four id schemas brand one shared schema, so its cases run once (through
// OrganisationId) and the last test checks that every id type shares it.

const accepts = (schema: Schema.ConstraintDecoder<unknown>, value: unknown) =>
  Schema.decodeUnknownExit(schema)(value)._tag === "Success"

describe("ids", () => {
  it("accept a UUID written as 32 lowercase hex digits, whatever its version", () => {
    expect(accepts(OrganisationId, "01a21eb07e777271bc870800d080dd59")).toBe(true) // v7, new rows
    expect(accepts(OrganisationId, "872006ead54540429aa373a40f761371")).toBe(true) // v4, legacy rows
  })

  it("reject the hyphenated form", () => {
    expect(accepts(OrganisationId, "01a21eb0-7e77-7271-bc87-0800d080dd59")).toBe(false)
  })

  it("reject upper-case digits, so each id has one spelling", () => {
    expect(accepts(OrganisationId, "01A21EB07E777271BC870800D080DD59")).toBe(false)
  })

  it("reject the wrong length and anything that is not hex", () => {
    for (
      const value of [
        "01a21eb07e777271bc870800d080dd5",
        "01a21eb07e777271bc870800d080dd590",
        "01a21eb07e777271bc870800d080ddzz",
        "acme",
        "",
        42
      ]
    ) {
      expect(accepts(OrganisationId, value)).toBe(false)
    }
  })

  it("are the same schema for every id type", () => {
    for (const schema of [OrganisationId, PersonId, ProgrammeId, SessionId]) {
      expect(accepts(schema, "01a21eb07e777271bc870800d080dd59")).toBe(true)
      expect(accepts(schema, "01a21eb0-7e77-7271-bc87-0800d080dd59")).toBe(false)
      expect(accepts(schema, "01A21EB07E777271BC870800D080DD59")).toBe(false)
    }
  })
})
