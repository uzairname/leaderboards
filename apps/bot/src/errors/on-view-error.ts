import { DiscordAPIError, RateLimitError } from '@discordjs/rest'
import { DiscordErrors, DiscordUserError, InteractionUserError } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { sentry } from '../logging/sentry'
import { App } from '../setup/app'
import { Colors } from '../utils/ui'
import { UserError, UserErrors } from './user-errors'
import { DbError, DbErrors } from '../../../../packages/db/src/errors'

export function onViewError(app: App) {
  return function (
    e: unknown,
    setSentryException?: (e: unknown) => void,
  ): D.APIInteractionResponseChannelMessageWithSource {
    // Convert the e to a UserError or Error object

    if (e instanceof UserError) {
      var _e = e
    } else if (e instanceof DiscordAPIError) {
      _e = new UserErrors.DiscordError(e)
    } else if (e instanceof DiscordUserError) {
      if (e instanceof DiscordErrors.BotPermissions) {
        _e = new UserErrors.BotPermissions(app, e)
      } else {
        _e = new UserError(e.message)
      }
    } else if (e instanceof RateLimitError) {
      _e = new UserErrors.DiscordRateLimit(e.timeToReset)
    } else if (e instanceof InteractionUserError) {
      _e = new UserError(e.message)
    } else if (e instanceof DbErrors.NotFound) {
      _e = new UserError(e.message)
    } else if (e instanceof Error) {
      _e = e
    } else {
      _e = new Error(e instanceof Error ? e.message : `${e}`)
    }

    return _onViewError(app, _e, setSentryException)
    // Log the error
  }
}

function _onViewError(
  app: App,
  e: Error,
  setSentryException?: (e: unknown) => void,
): D.APIInteractionResponseChannelMessageWithSource {
  let embed: D.APIEmbed

  if (e instanceof UserError) {
    sentry.addBreadcrumb({
      message: 'UserError',
      level: 'info',
      data: {
        message: e.message,
        stack: e.stack,
      },
    })

    embed = {
      title: e.title,
      description: e.message,
      color: Colors.EmbedBackground,
    }
  } else {
    // If not a user error, it is unexpected
    setSentryException ? setSentryException(e) : sentry.setException(e)

    let description = `\`${e.name}: ${e.message}\`

If this is a bug, please report it in the [support server](${app.config.SupportServerInvite})`

    if (app.config.IsDev) {
      // If in dev, add the error to the description
      description =
        description +
        `
\`\`\`json
${
  e instanceof Error
    ? JSON.stringify(
        {
          name: e.name,
          message: e.message,
          stack: e.stack?.split('\n') ?? undefined,
          error: e,
        },
        null,
        2,
      )
    : e
}
\`\`\``
    }

    embed = {
      description,
      color: Colors.Error,
    }
  }

  const response: D.APIInteractionResponseChannelMessageWithSource = {
    type: D.InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [embed],
      flags: D.MessageFlags.Ephemeral,
    },
  }

  return response
}
