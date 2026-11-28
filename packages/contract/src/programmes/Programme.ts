import { Schema } from "effect"
import { ProgrammeRole } from "../access/Roles.ts"
import { ProgrammeId } from "../Ids.ts"

export const Programme = Schema.Struct({
  id: ProgrammeId,
  name: Schema.String
})
export type Programme = typeof Programme.Type

/** A programme the signed-in person holds at least one role in. */
export const MyProgramme = Schema.Struct({
  programme: Programme,
  /** Sorted by name. */
  roles: Schema.Array(ProgrammeRole)
})
export type MyProgramme = typeof MyProgramme.Type
