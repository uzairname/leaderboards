import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import type { DiscordAPIClient } from '../rest/client'
import { AnyAppCommand, viewIsChatInputAppCommand } from './types'

export async function overwriteDiscordCommandsWithViews(
  bot: DiscordAPIClient,
  commands: AnyAppCommand[],
  guild_id?: string,
): Promise<D.RESTPutAPIApplicationCommandsResult> {
  const commands_data = commands.map(appCommandToJSONBody)

  let result: D.RESTPutAPIApplicationGuildCommandsResult

  if (guild_id === undefined) {
    result = await bot.overwriteGlobalCommands(commands_data)
  } else {
    result = await bot.overwriteGuildCommands(guild_id, commands_data)
  }

  sentry.addBreadcrumb({
    category: 'discord',
    message:
      `Successfully overwrote application commands` +
      (guild_id ? ` in guild ${guild_id}` : ' globally'),
    level: 'info',
    data: {
      commands: commands.map(c => c.config.name),
      guild_id,
    },
  })

  return result
}

function appCommandToJSONBody(view: AnyAppCommand): D.RESTPostAPIApplicationGuildCommandsJSONBody {
  if (viewIsChatInputAppCommand(view) && view.config.description.length > 100) {
    throw new Error(`Description for command ${view.config.custom_id_prefix} > 100 characters`)
  }

  const result = {
    ...view.config,
  }

  delete result.custom_id_prefix
  delete result.state_schema

  return result
}
