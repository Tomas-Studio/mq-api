import { PgTypes } from "@effect/sql-pg"
import { Result } from "effect"

// Ids are written as 32 lowercase hex digits with no hyphens (ADR-0032). The
// driver's built-in uuid codec reads the hyphenated form, so every client the
// API creates passes `idTypes` as its `types` option. Parameters need nothing:
// strings are sent untyped and Postgres accepts the hyphen-free form.

const hyphenFree = /^[0-9a-fA-F]{32}$/
const hyphenated = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

const read = (bytes: Uint8Array, offset: number, size: number): Result.Result<string, PgTypes.CodecError> => {
  if (size !== 16) {
    return Result.fail(new PgTypes.CodecError({ message: `Expected 16 bytes for a uuid, received ${size}` }))
  }
  return Result.succeed(Buffer.from(bytes.buffer, bytes.byteOffset + offset, 16).toString("hex"))
}

// Only reached for parameters typed as uuid explicitly; both forms are accepted.
const encode = (value: string): Result.Result<Uint8Array, PgTypes.CodecError> => {
  const digits = hyphenFree.test(value) ? value : hyphenated.test(value) ? value.replaceAll("-", "") : undefined
  if (digits === undefined) {
    return Result.fail(new PgTypes.CodecError({ message: `Expected a UUID, received "${value}"` }))
  }
  return Result.succeed(new Uint8Array(Buffer.from(digits, "hex")))
}

const makeIdTypes = (): PgTypes.Registry => {
  const registry = PgTypes.makeRegistry()
  registry.register<string>(PgTypes.OID.uuid, {
    encode,
    decode: (bytes) => read(bytes, 0, bytes.length),
    read
  }, { arrayOid: PgTypes.OID.uuidArray })
  return registry
}

/** Codec registry for every `PgClient`: `uuid` values read as 32 lowercase hex digits (ADR-0032). */
export const idTypes: PgTypes.Registry = makeIdTypes()
