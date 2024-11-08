import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import type { DiscordAPIClient } from '../rest/client'
import { AnyCommandView, viewIsChatInputCommand } from './types'

export function overwriteDiscordCommandsWithViews(
  bot: DiscordAPIClient,
  commands: AnyCommandView[],
  guild_id?: string,
): void {
  const commands_data = commands.map(appCommandToJSONBody)

  let result: D.RESTPutAPIApplicationGuildCommandsResult

  sentry.offload(
    async () => {
      if (guild_id === undefined) {
        result = await bot.replaceGlobalCommands(commands_data)
      } else {
        result = await bot.replaceGuildCommands(guild_id, commands_data)
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
    },
    undefined,
    `Put ${guild_id ? 'guild' : 'global'} commands`,
  )
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
