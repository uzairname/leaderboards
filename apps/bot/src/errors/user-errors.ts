import { DiscordAPIError } from '@discordjs/rest'
import { Player } from '@repo/db/models'
import { DiscordErrors } from '@repo/discord'
import { truncateString } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../setup/app'
import { inviteUrl, listToString, permsToString } from '../utils/ui'

export class UserError extends Error {
  /**
   * Any exception while interacting with the Bot.
   * @param message Message displayed in the embed body.
   * @param title Title of the error message.
   */

  constructor(
    message?: string,
    public title?: string,
  ) {
    super(message)
    this.name = `${UserError.name}.${this.constructor.name}`
  }
}

// Errors that are expected and displayed to the user
export namespace UserErrors {
  export class NotComponentOwner extends UserError {
    constructor(owner_id?: string) {
      super(owner_id ? `This message belongs to <@${owner_id}>` : `This message belongs to someone else`)
    }
  }

  export class BotPermissions extends UserError {
    constructor(app: App, e: DiscordErrors.BotPermissions) {
      const missing_perms = e.missingPermissionsNames

      const title = `Missing Permissions${missing_perms.length > 0 ? `: ${truncateString(permsToString(missing_perms), 60)}` : ``}`

      const msg = `[Click here](${inviteUrl(app)}) to re-invite the bot with the required permissions, then ensure that no roles or channels are restricting its permissions. If this doesn't work, then this action is not allowed.`

      super(msg, title)
    }
  }

  export class DiscordRateLimit extends UserError {
    constructor(public timeToReset: number) {
      super(`Being rate limited. Try again in ${timeToReset / 1000} seconds`)
    }
  }

  export class DiscordError extends UserError {
    constructor(e: DiscordAPIError) {
      let description: string
      if (e.code === D.RESTJSONErrorCodes.MissingAccess) {
        description = 'Missing access to the channel, server, or resource'
      } else {
        description = e.message
      }
      super(description)
    }
  }

  export class ValidationError extends UserError {}

  export class OngoingMatchEror extends UserError {}

  export class PlayersDisabled extends UserError {
    constructor(disabled_players: Player[]) {
      super(listToString(disabled_players.map(p => `<@${p.data.user_id}>`)) + ` cannot participate in this ranking`)
    }
  }
}
