import {
  APIInteractionResponseChannelMessageWithSource,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'
import { sentry } from '../../../utils/globals'
import { DiscordErrors } from '../../../discord/rest/errors'
import { Messages } from '../../messages/messages'
import { AppError } from '../../messages/errors'
import { RateLimitError } from '@discordjs/rest'
import { App } from '../../app'
import { Colors, toMarkdown } from '../../messages/message_pieces'

export const onViewError = (app: App) =>
  function (e: unknown): APIInteractionResponseChannelMessageWithSource {
    let description: string
    let title: string

    if (e instanceof DiscordErrors.BotPermissions) {
      description = Messages.botPermisssionsErrorDescription(app.bot, e)
      title = 'Missing permissions'
    } else if (e instanceof RateLimitError) {
      description = `Try again in ${e.timeToReset / 1000} seconds`
      title = 'Being Rate limited'
    } else if (e instanceof AppError) {
      description = e.message ? e.message : e.constructor.name
      title = 'Something went wrong'
    } else {
      sentry.debug('Unknown error, sending to sentry')
      sentry.catchAfterResponding(e)
      title = 'Something went wrong'

      if (app.config.features.DETAILED_ERROR_MESSAGES) {
        description = `Unexpected error
            \n\`\`\`Details:
            \n${
              e instanceof Error
                ? toMarkdown(
                    JSON.stringify(
                      {
                        name: e.name,
                        message: e.message,
                        stack: e.stack?.split('\n') ?? undefined,
                        error: e,
                      },
                      null,
                      2,
                    ),
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
): APIInteractionResponseChannelMessageWithSource {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title,
          description,
          color: Colors.EmbedBackground,
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  }
}
