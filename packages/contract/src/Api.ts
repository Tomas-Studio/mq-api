import { HttpApi } from "effect/http-api"
import { IdentityApi } from "./identity/IdentityApi.ts"
import { OrganisationsApi } from "./organisations/OrganisationsApi.ts"
import { ProgrammesApi } from "./programmes/ProgrammesApi.ts"
import { SystemApi } from "./system/SystemApi.ts"

/**
 * The MEQuest platform API. Changes are additive only (ADR-0017).
 * Served under `/api` on every web domain through Front Door (ADR-0025).
 */
export class MqApi extends HttpApi.make("mq-api")
  .add(SystemApi)
  .add(IdentityApi)
  .add(OrganisationsApi)
  .add(ProgrammesApi)
  .prefix("/api")
{}
