import { DiscordAPIError, RateLimitError } from '@discordjs/rest'
import { DiscordErrors } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { UserError, UserErrors } from '../../errors/UserError'
import { sentry } from '../../logging/sentry'
import { Colors } from '../../ui-helpers/constants'
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
      if (e.code === D.RESTJSONErrorCodes.MissingAccess) {
        description = 'Missing access to the channel, server, or resource'
      } else {
        description = e.message
      }
    } else if (e instanceof DiscordErrors.BotPermissions) {
      return onViewError(app)(new UserErrors.BotPermissions(app, e))
    } else if (e instanceof RateLimitError) {
      title = 'Being Rate limited'
      description = `Try again in ${e.timeToReset / 1000} seconds`
    } else if (e instanceof Error) {
      description = `${e.name ?? e.constructor.name}: ${e.message ?? e}`
    } else {
      description = 'An unexpected error occured'
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
