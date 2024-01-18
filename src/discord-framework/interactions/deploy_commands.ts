import * as D from 'discord-api-types/v10'
import { sentry } from '../../request/sentry'
import type { DiscordAPIClient } from '../rest/client'
import { AnyCommandView, isChatInputCommandView } from './types'

export async function overwriteDiscordCommandsWithViews(
  bot: DiscordAPIClient,
  views: AnyCommandView[],
) {
  const guild_commands: {
    [guild_id: string]: D.RESTPostAPIApplicationCommandsJSONBody[]
  } = {}
  const global_commands: D.RESTPostAPIApplicationCommandsJSONBody[] = []

  views.forEach(view => {
    if (view.options.guild_id) {
      if (!guild_commands[view.options.guild_id]) {
        guild_commands[view.options.guild_id] = []
      }
      guild_commands[view.options.guild_id].push(validateAndGetPostJSONBody(view))
    } else {
      global_commands.push(validateAndGetPostJSONBody(view))
    }
  })

  await Promise.all(
    Object.entries(guild_commands)
      .map(([guild_id, commands]) => bot.overwriteGuildCommands(guild_id, commands))
      .concat(bot.overwriteGlobalCommands(global_commands)),
  )

  sentry.addBreadcrumb({
    category: 'discord',
    message: 'Overwrote commands in discord',
    level: 'info',
    data: {
      guild_commands,
      global_commands,
    },
  })
}

function validateAndGetPostJSONBody(
  view: AnyCommandView,
): D.RESTPostAPIApplicationGuildCommandsJSONBody {
  if (isChatInputCommandView(view) && view.options.description.length > 100) {
    throw new Error(`Description for command ${view.options.custom_id_prefix} > 100 characters`)
  }

  return {
    ...view.options,
  } as D.RESTPostAPIApplicationGuildCommandsJSONBody
}
