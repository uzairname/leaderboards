import { DiscordAPIError } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging'
import type { DiscordAPIClient } from '../rest/client'
import { AnyAppCommand, viewIsChatInputAppCommand } from './types'

export async function overwriteDiscordCommandsWithViews(
  bot: DiscordAPIClient,
  commands: AnyAppCommand[],
  guild_id: string | undefined,
) {
  const commands_data = commands.map(appCommandToJSONBody)

  if (guild_id === undefined) {
    await bot.overwriteGlobalCommands(commands_data)
  } else {
    try {
      await bot.overwriteGuildCommands(guild_id, commands_data)
    } catch (e) {
      if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.MissingAccess) {
        throw new Error(`Missing access to guild ${guild_id}`)
      }
    }
  }

  sentry.addBreadcrumb({
    category: 'discord',
    message:
      `Successfully overwrote application commands` +
      (guild_id ? ` in guild ${guild_id}` : ' globally'),
    level: 'info',
    data: {
      commands: commands.map(c => c.options.name),
      guild_id,
    },
  })
}

function appCommandToJSONBody(view: AnyAppCommand): D.RESTPostAPIApplicationGuildCommandsJSONBody {
  if (viewIsChatInputAppCommand(view) && view.options.description.length > 100) {
    throw new Error(`Description for command ${view.options.custom_id_prefix} > 100 characters`)
  }

  return {
    ...view.options,
  } as D.RESTPostAPIApplicationGuildCommandsJSONBody
}
