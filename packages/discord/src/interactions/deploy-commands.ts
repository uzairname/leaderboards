import * as D from 'discord-api-types/v10'
import type { DiscordAPIClient } from '../rest/client'
import { isChatInputCommandSignature } from './checks/handlers'
import { AnyCommandSignature } from './types'

export async function putDiscordCommands(
  bot: DiscordAPIClient,
  commands: AnyCommandSignature[],
  guild_id?: string,
): Promise<void> {
  const commands_data = commands.map(appCommandToJSONBody)

  let result: D.RESTPutAPIApplicationGuildCommandsResult

  if (undefined === guild_id) {
    result = await bot.replaceGlobalCommands(commands_data)
  } else {
    result = await bot.replaceGuildCommands(guild_id, commands_data)
  }
}

export function appCommandToJSONBody(view: AnyCommandSignature): D.RESTPostAPIApplicationGuildCommandsJSONBody {
  if (isChatInputCommandSignature(view) && view.config.description.length > 100) {
    throw new Error(`Description for slash command ${view.config.name} > 100 characters`)
  }

  const result = {
    ...view.config,
  }

  return result
}
