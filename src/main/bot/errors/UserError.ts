import { DiscordErrors } from '../../../discord-framework'
import { App } from '../../app/App'
import { inviteUrl, permsToString } from '../ui-helpers/strings'

export class UserError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = `${UserError.name}.${this.constructor.name}`
  }
}

// Errors that are expected and displayed to the user
export namespace UserErrors {
  export class NotComponentOwner extends UserError {
    constructor(owner_id?: string) {
      super(
        owner_id
          ? `This message belongs to <@${owner_id}>`
          : `This message belongs to someone else`,
      )
    }
  }

  export class BotPermissions extends UserError {
    constructor(app: App, e: DiscordErrors.BotPermissions) {
      let msg = "I'm missing some permissions"

      const missing_perms = e.missingPermissionsNames

      if (missing_perms.length > 0) {
        msg = `I'm missing the following permissions: ${permsToString(missing_perms)}`
      }
      msg = msg + `\n[Click here to re-invite me with the required perms](${inviteUrl(app)})`
      super(msg)
    }
  }

  export class ValidationError extends UserError {}

  export class OngoingMatchEror extends UserError {}
}
