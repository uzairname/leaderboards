import { DiscordAPIError } from '@discordjs/rest'
import { Player } from '@repo/db/models'
import { DiscordErrors } from '@repo/discord'
import { listToString, truncateString } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../setup/app'
import { inviteUrl, permsToString } from '../api/utils'

export class UserError extends Error {
  /**
   * Any exception while interacting with the Bot.
   * @param message Message displayed in the embed body.
   * @param title Title of the error message.
   */

  constructor(
    message: string,
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

  export class UnknownView extends UserError {
    constructor() {
      super(`Unrecognized command or component. It may be outdated`)
    }
  }

  export class BotPermissions extends UserError {
    constructor(app: App, e: DiscordErrors.BotPermissions) {
      const missing_perms = e.missingPermissionsNames

      const title = `The Bot is Missing Permissions${missing_perms.length > 0 ? `: ${truncateString(permsToString(missing_perms), 60)}` : ``}`

      const msg = `**[Click here](${inviteUrl(app)}) to re-invite the bot with the required permissions**, then ensure that no roles or channels are overriding them.`

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

  export class RolePermissions extends UserError {
    constructor(app: App, role_id: string) {
      const msg = `The bot is attempting to manage the <@&${role_id}> role.
- If the app doesn't have the **Manage Roles** permission, [Click here](${inviteUrl(app)}) to re-invite the bot with the required permissions
- If the role is reserved or higher than the bot's highest role, then ensure that the bot has access to all roles you want it to manage.`
      const title = `Missing Role Permissions`
      super(msg, title)
      this.name = `${UserErrors.RolePermissions.name}.${this.constructor.name}`
    }
  }
}
