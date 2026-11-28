import { PgTypes } from "@effect/sql-pg"
import { assert, describe, expect, it } from "@effect/vitest"
import { Result } from "effect"
import { idTypes } from "../src/index.ts"

// ADR-0032: `idTypes` reads uuid columns as 32 lowercase hex digits.

const id = "01a21eb07e777271bc870800d080dd59"
const wire = new Uint8Array(Buffer.from(id, "hex"))

const decoded = (bytes: Uint8Array, registry?: PgTypes.Registry) => {
  const result = PgTypes.decode(bytes, PgTypes.OID.uuid, 1, registry)
  assert(Result.isSuccess(result))
  return result.success
}

const encoded = (value: string) => {
  const result = PgTypes.encode(value, PgTypes.OID.uuid, idTypes)
  assert(Result.isSuccess(result))
  return result.success
}

describe("idTypes", () => {
  it("reads a uuid as 32 lowercase hex digits", () => {
    expect(decoded(wire, idTypes)).toBe(id)
  })

  it("leaves the driver's default registry alone", () => {
    expect(decoded(wire)).toBe("01a21eb0-7e77-7271-bc87-0800d080dd59")
  })

  it("fails on a value that is not 16 bytes", () => {
    expect(Result.isFailure(PgTypes.decode(wire.subarray(0, 15), PgTypes.OID.uuid, 1, idTypes))).toBe(true)
  })

  it("encodes the hyphen-free and hyphenated forms to the same 16 bytes", () => {
    expect(encoded(id)).toEqual(wire)
    expect(encoded("01a21eb0-7e77-7271-bc87-0800d080dd59")).toEqual(wire)
  })

  it("refuses to encode anything else", () => {
    for (const value of ["acme", "01a21eb07e777271bc870800d080dd5", "01a21eb0-7e777271-bc87-0800d080dd59"]) {
      expect(Result.isFailure(PgTypes.encode(value, PgTypes.OID.uuid, idTypes))).toBe(true)
    }
  })
})
