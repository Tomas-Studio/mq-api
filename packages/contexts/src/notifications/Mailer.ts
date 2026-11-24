import { Context, Effect, Layer, Ref, Schema } from "effect"

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
}

export class MailError extends Schema.TaggedError<MailError>()("MailError", {
  message: Schema.String
}) {}

/** Collects sent mail in memory. Tests read `sent`; `Mailer.layerMailbox` delivers into it. */
export class Mailbox extends Context.Service<Mailbox, {
  readonly sent: Effect.Effect<ReadonlyArray<MailMessage>>
  readonly deliver: (message: MailMessage) => Effect.Effect<void>
}>()("mq/notifications/Mailbox") {
  static readonly layer = Layer.effect(
    Mailbox,
    Effect.gen(function*() {
      const sent = yield* Ref.make<ReadonlyArray<MailMessage>>([])
      return {
        sent: Ref.get(sent),
        deliver: (message: MailMessage) => Ref.update(sent, (all) => [...all, message])
      }
    })
  )
}

/**
 * Sends email. The production transport (Resend, architecture §11) is still to
 * come; until then only the development log and the in-memory mailbox exist.
 */
export class Mailer extends Context.Service<Mailer, {
  readonly send: (message: MailMessage) => Effect.Effect<void, MailError>
}>()("mq/notifications/Mailer") {
  /** Development only: writes every message, sign-in codes included, to the log. */
  static readonly layerLog = Layer.succeed(Mailer)({
    send: (message) => Effect.logInfo("mail (development log transport)", message)
  })

  /** Delivers into `Mailbox`, for tests. */
  static readonly layerMailbox = Layer.effect(
    Mailer,
    Effect.gen(function*() {
      const mailbox = yield* Mailbox
      return { send: mailbox.deliver }
    })
  )
}
