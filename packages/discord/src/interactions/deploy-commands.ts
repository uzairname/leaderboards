import * as D from 'discord-api-types/v10'
// import { sentry } from '../../logging/sentry'
import type { DiscordAPIClient } from '../rest/client'
import { AnyCommandView, viewIsChatInputCommand } from './handler/types'

export async function overwriteDiscordCommandsWithViews(
  bot: DiscordAPIClient,
  commands: AnyCommandView[],
  guild_id?: string,
): Promise<void> {
  const commands_data = commands.map(appCommandToJSONBody)

  let result: D.RESTPutAPIApplicationGuildCommandsResult

  if (guild_id === undefined) {
    result = await bot.replaceGlobalCommands(commands_data)
  } else {
    result = await bot.replaceGuildCommands(guild_id, commands_data)
  }
}

export function appCommandToJSONBody(
  view: AnyCommandView,
): D.RESTPostAPIApplicationGuildCommandsJSONBody {
  if (viewIsChatInputCommand(view) && view.config.description.length > 100) {
    throw new Error(`Description for command ${view.config.custom_id_prefix} > 100 characters`)
  }

  const result = {
    ...view.config,
  }

  delete result.custom_id_prefix
  delete result.state_schema

  return result
}
