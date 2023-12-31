import { RateLimitError } from '@discordjs/rest'
import {
  APIInteractionResponseChannelMessageWithSource,
  InteractionResponseType,
  MessageFlags,
} from 'discord-api-types/v10'

import { sentry } from '../../logging/globals'
import { Messages } from '../messages/messages'
import { App } from '../app'
import { Colors, toMarkdown } from '../messages/message_pieces'

import { DiscordErrors } from '../../discord-framework'
import { AppError, UserError } from '../errors'
import { DatabaseError } from '../../database/utils/errors'

export const onViewError = (app: App) =>
  function (e: unknown): APIInteractionResponseChannelMessageWithSource {
    let description: string
    let title: string

    if (e instanceof DiscordErrors.BotPermissions) {
      description = Messages.botPermisssionsError(app.bot, e)
      title = 'Missing permissions'
    } else if (e instanceof RateLimitError) {
      description = `Try again in ${e.timeToReset / 1000} seconds`
      title = 'Being Rate limited'
    } else if (e instanceof UserError || e instanceof DatabaseError || e instanceof AppError) {
      description = e.message ? e.message : e.constructor.name
      title = 'Something went wrong'
    } else {
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
