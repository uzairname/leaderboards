import { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10'
import { DiscordRESTClient } from '../rest/client'
import { AnyCommandView, isChatInputCommandView } from './types'
import { sentry } from '../../logging/globals'

export async function overwriteDiscordCommandsWithViews(
  bot: DiscordRESTClient,
  views: AnyCommandView[],
) {
  let guild_commands: {
    [guild_id: string]: RESTPostAPIApplicationCommandsJSONBody[]
  } = {}
  let global_commands: RESTPostAPIApplicationCommandsJSONBody[] = []

  views.map((view) => {
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

function validateAndGetPostJSONBody(view: AnyCommandView) {
  if (isChatInputCommandView(view) && view.options.command.description.length > 100) {
    throw new Error(`Description for command ${view.options.custom_id_prefix} > 100 characters`)
  }
  const body = {
    type: view.options.type,
    ...view.options.command,
  } as RESTPostAPIApplicationCommandsJSONBody
  return body
}
