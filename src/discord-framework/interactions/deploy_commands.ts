import * as D from 'discord-api-types/v10'
import { sentry } from '../../request/sentry'
import type { DiscordAPIClient } from '../rest/client'
import { AnyAppCommand, viewIsChatInputAppCommand } from './types'

export async function overwriteDiscordCommandsWithViews(
  bot: DiscordAPIClient,
  commands: AnyAppCommand[],
  guild_id: string | undefined,
) {
  const commands_data = commands.map(validateAndGetPostJSONBody)

  if (guild_id === undefined) {
    await bot.overwriteGlobalCommands(commands_data)
  } else {
    await bot.overwriteGuildCommands(guild_id, commands_data)
  }

  sentry.addBreadcrumb({
    category: 'discord',
    message: 'Overwrote commands in discord',
    level: 'info',
    data: {
      commands,
      guild_id,
    },
  })
}

function validateAndGetPostJSONBody(
  view: AnyAppCommand,
): D.RESTPostAPIApplicationGuildCommandsJSONBody {
  if (viewIsChatInputAppCommand(view) && view.options.description.length > 100) {
    throw new Error(`Description for command ${view.options.custom_id_prefix} > 100 characters`)
  }

  return {
    ...view.options,
  } as D.RESTPostAPIApplicationGuildCommandsJSONBody
}
