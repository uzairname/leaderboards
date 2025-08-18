import { appCommandToJSONBody } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { IttyRouter } from 'itty-router/IttyRouter'
import { json } from 'itty-router/json'
import { App } from '../../setup/app'

export default (app: App) =>
  IttyRouter({ base: '/api/commands' })
    .get('/', async request => {
      app.db.cache.clear()

      const global_commands = await app.interactionHandler.getCommandSignatures({
        arg: app,
        include_experimental: app.config.features.ExperimentalCommands,
      })

      const commands_data = global_commands.map(appCommandToJSONBody)
      const query = {
        route: D.Routes.applicationCommands(app.discord.applicationId),
        body: commands_data,
      }

      return json(query)
    })

    .get('/:guild_id', async request => {
      app.db.cache.clear()
      const guild_id = request.params.guild_id

      const commands = await app.interactionHandler.getCommandSignatures({
        arg: app,
        guild_id: guild_id,
        include_experimental: app.config.features.ExperimentalCommands,
      })

      const commands_data = commands.map(appCommandToJSONBody)
      const query = {
        route: D.Routes.applicationGuildCommands(app.discord.applicationId, guild_id),
        body: commands_data,
      }

      return json(query)
    })
