import {
  APIInteractionResponseChannelMessageWithSource,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'
import { config, sentry } from '../../utils/globals'
import { DiscordErrors } from '../../discord/rest/errors'
import { Messages } from '../helpers/messages/messages'
import { AppError } from '../errors'
import { RateLimitError } from '@discordjs/rest'
import { App } from '../app'

export const onInteractionError = (app: App) =>
  function (e: unknown): APIInteractionResponseChannelMessageWithSource {
    let description: string
    let title: string

    if (e instanceof DiscordErrors.BotPermissions) {
      description = Messages.botPermisssionsErrorDescription(app.bot, e)
      title = 'Missing permissions'
    } else if (e instanceof RateLimitError) {
      description = `Try again in ${e.timeToReset} seconds`
      title = 'Being Rate limited'
    } else if (e instanceof AppError) {
      description = e.message ? e.message : e.constructor.name
      title = 'Something went wrong'
    } else {
      sentry.catchAfterResponding(e)
      title = 'Something went wrong'

      if (config.features.DETAILED_ERROR_MESSAGES) {
        description = `Unexpected error
            \n\`\`\`Details:
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
      } else {
        description = 'An unexpected error occurred'
      }
    }

    return errorResponse(title, description)
  }

function errorResponse(
  title: string,
  description: string,
  json_data?: JSON,
): APIInteractionResponseChannelMessageWithSource {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title,
          description,
          color: 0xff0000,
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  }
}
