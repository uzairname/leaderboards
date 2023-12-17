import { RateLimitError } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { DatabaseError } from '../../../database/errors'
import { DiscordErrors } from '../../../discord-framework'
import { ViewErrors } from '../../../discord-framework/interactions/utils/errors'
import { sentry } from '../../../request/sentry'
import { App } from '../../app/app'
import { AppError, UserError } from '../../app/errors'
import { Colors } from '../../messages/message_pieces'
import { Messages } from '../../messages/messages'

export const onViewError = (app: App) =>
  function (e: unknown): D.APIInteractionResponseChannelMessageWithSource {
    let description: string
    let title: string
    if (e instanceof DiscordErrors.BotPermissions) {
      title = 'Missing permissions'
      description = Messages.botPermisssionsError(app.bot, e)
    } else if (e instanceof RateLimitError) {
      title = 'Being Rate limited'
      description = `Try again in ${e.timeToReset / 1000} seconds`
    } else if (
      e instanceof UserError ||
      e instanceof DatabaseError ||
      e instanceof AppError ||
      e instanceof DiscordErrors.ForumInNonCommunityServer
    ) {
      description = e.message ? e.message : e.constructor.name
      title = 'Error'
    } else if (
      e instanceof ViewErrors.UnknownView ||
      e instanceof ViewErrors.InvalidEncodedCustomId
    ) {
      title = 'Unknown Message'
      description = 'This component is outdated or unavailable. Please delete it.'
    } else {
      title = 'Unexpected Error'

      description = 'An error occurred'
      if (app.config.features.DETAILED_ERROR_MESSAGES) {
        description =
          description +
          `\n\`\`\`Details:
            \n${
              e instanceof Error
                ? JSON.stringify(
                    {
                      name: e.name,
                      message: e.message,
                      stack: e.stack?.split('\n') ?? undefined,
                      error: e
                    },
                    null,
                    2
                  )
                : e
            }
            \n\`\`\``
      }
    }

    if (!(e instanceof UserError)) {
      sentry.catchAfterResponding(e)
    } else {
      sentry.addBreadcrumb({
        message: 'UserError',
        level: 'info',
        data: {
          message: e.message,
          stack: e.stack
        }
      })
    }

    return errorResponse(title, description)
  }

function errorResponse(
  title: string,
  description: string
): D.APIInteractionResponseChannelMessageWithSource {
  return {
    type: D.InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title,
          description,
          color: Colors.EmbedBackground
        }
      ],
      flags: D.MessageFlags.Ephemeral
    }
  }
}
