import type { MyOrganisation, Organisation, OrganisationId, PersonId } from "@mequest/contract"
import { withTenant } from "@mequest/db"
import { Array, Context, Effect, Layer, Option, Order } from "effect"
import { SqlClient } from "effect/sql"
import { Access } from "../access/index.ts"
import { makeRepo } from "./Repo.ts"

const byName = Order.mapInput(Order.String, (mine: MyOrganisation) => mine.organisation.name)

/** Organisations and the signed-in person's view of them. */
export class Organisations extends Context.Service<Organisations>()("mq/Organisations", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* makeRepo
    const access = yield* Access

    // Database failures are defects: callers only ever see declared errors.
    const inOrganisation = (organisationId: OrganisationId) => <A, E>(self: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      withTenant({ organisationId, role: "mq_ctx_org" })(self).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie
      )

    const get = Effect.fn("Organisations.get")(
      function*(organisationId: OrganisationId): Effect.fn.Return<Option.Option<Organisation>> {
        return yield* inOrganisation(organisationId)(repo.find(organisationId))
      }
    )

    /**
     * Every organisation the person belongs to, sorted by name: the memberships
     * in one person-scoped read, then one tenant-scoped read per organisation
     * (ADR-0012, ADR-0031).
     */
    const listMine = Effect.fn("Organisations.listMine")(
      function*(personId: PersonId): Effect.fn.Return<ReadonlyArray<MyOrganisation>> {
        const memberships = yield* access.organisationsOf(personId)
        const found = yield* Effect.forEach(
          memberships,
          (membership) =>
            get(membership.organisationId).pipe(
              Effect.map(Option.map((organisation): MyOrganisation => ({ organisation, role: membership.role })))
            ),
          { concurrency: 4 }
        )
        return Array.sort(Array.getSomes(found), byName)
      }
    )

    return { get, listMine } as const
  })
}) {
  static readonly layer = Layer.effect(Organisations, Organisations.make)
}
