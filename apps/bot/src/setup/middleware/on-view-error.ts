import { DiscordAPIError, RateLimitError } from '@discordjs/rest'
import { DiscordErrors, InteractionErrors } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { UserError, UserErrors } from '../../errors/UserError'
import { sentry } from '../../logging/sentry'
import { Colors } from '../../utils/ui/strings'
import { App } from '../app'

export function onViewError(app: App) {
  return function (
    e: unknown,
    setSentryException?: (e: unknown) => void,
  ): D.APIInteractionResponseChannelMessageWithSource {
    // Convert the error to a title and message to respond with
    let description: string
    let title: string = 'Error'
    if (e instanceof UserError) {
      description = e.message
    } else if (e instanceof DiscordAPIError) {
      return onViewError(app)(new UserErrors.DiscordError(e))
    } else if (e instanceof DiscordErrors.BotPermissions) {
      return onViewError(app)(new UserErrors.BotPermissions(app, e))
    } else if (e instanceof DiscordErrors.GeneralPermissions) {
      return onViewError(app)(new UserError(e.message))
    }
    else if (e instanceof RateLimitError) {
      return onViewError(app)(new UserErrors.RateLimitError(e.timeToReset))
    } else if (e instanceof InteractionErrors.WrongContext) {
      description = e.message
    } else {
      title = `Unexpected Error`
      if (e instanceof Error) {
        description = `${e.name ?? e.constructor.name}: ${e.message ?? e}`
      } else {
        description = `${e}`
      }
      description += `\n\nIf this is a bug, please report it in the [discord server](${app.config.DevGuildId}!`
    }

    // Log the error
    if (e instanceof UserError) {
      sentry.addBreadcrumb({
        message: 'UserError',
        level: 'info',
        data: {
          message: e.message,
          stack: e.stack,
        },
      })
    } else {
      // If not a user error, it is unexpected
      setSentryException !== undefined ? setSentryException(e) : sentry.setException(e)
      if (app.config.IsDev) {
        // If in dev, add the error to the description
        description =
          description +
          `\n\`\`\`json
          \n${
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
          \n\`\`\``
      }
    }

    return errorResponse(title, description)
  }
}

function errorResponse(
  title: string,
  description: string,
): D.APIInteractionResponseChannelMessageWithSource {
  return {
    type: D.InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title,
          description,
          color: Colors.EmbedBackground,
        },
      ],
      flags: D.MessageFlags.Ephemeral,
    },
  }
}
