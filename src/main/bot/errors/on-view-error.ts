import { DiscordAPIError, RateLimitError } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { DbError, DbErrors } from '../../../database/errors'
import { DiscordErrors } from '../../../discord-framework'
import { ViewErrors } from '../../../discord-framework/interactions/errors'
import { sentry } from '../../../logging/sentry'
import { App } from '../../app/App'
import { Colors } from '../ui-helpers/constants'
import { botPermisssionsErrorMessage } from '../ui-helpers/strings'
import { UserError } from './UserError'

export default (app: App) =>
  function (
    e: unknown,
    setSentryException?: (e: unknown) => void,
  ): D.APIInteractionResponseChannelMessageWithSource {
    let description: string
    let title: string
    if (e instanceof DiscordErrors.BotPermissions) {
      title = 'Missing permissions'
      description = botPermisssionsErrorMessage(app, e)
    } else if (e instanceof DiscordAPIError) {
      title = `Error: ${e.message}`
      description = e.message
    } else if (e instanceof RateLimitError) {
      title = 'Being Rate limited'
      description = `Try again in ${e.timeToReset / 1000} seconds`
    } else if (
      e instanceof UserError ||
      e instanceof DbErrors.NotFound ||
      e instanceof DiscordErrors.ForumInNonCommunityServer
    ) {
      title = 'Error'
      description = e.message ?? e.constructor.name
    } else if (
      e instanceof ViewErrors.UnknownView ||
      e instanceof ViewErrors.InvalidEncodedCustomId
    ) {
      title = 'Error'
      description = 'Unrecognized command or component'
    } else {
      title = 'Error'
      description = 'An unexpected error occured'

      if (app.config.IsDev) {
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

    if (!(e instanceof UserError)) {
      setSentryException !== undefined ? setSentryException(e) : sentry.setException(e)
    } else {
      sentry.addBreadcrumb({
        message: 'AppError',
        level: 'info',
        data: {
          message: e.message,
          stack: e.stack,
        },
      })
    }

    return errorResponse(title, description)
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
