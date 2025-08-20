import * as sentry from '@sentry/cloudflare'
import { IttyRouter } from 'itty-router/IttyRouter'
import { getOrAddGuild } from '../api/guilds/manage'
import { getAppRoleConnectionsMetadata } from '../api/role-connections/role-connections'
import { App, syncDiscordCommands } from '../setup/app'

export default (app: App) =>
  IttyRouter({ base: '/update' })
    .post('/', async () => {
      await app.db.settings.getOrUpdate({
        last_updated: new Date(),
      })

      const [_, guildNames] = await Promise.all([
        syncDiscordCommands(app),
        app.db.guilds.getAll().then(guilds =>
          Promise.all(
            guilds.map(guild =>
              syncDiscordCommands(app, guild)
                .then(() => guild.data.name)
                .catch(() => undefined),
            ),
          ).then(res => res.filter(c => undefined !== c)),
        ),
        app.discord.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app)),
      ])

      sentry.addBreadcrumb({
        message: `Updated Leaderboards app in ${guildNames.length} guilds`,
        data: { guild_names: guildNames },
      })

      return new Response(`Updated Leaderboards app in ${guildNames.length} guilds`, {
        status: 200,
      })
    })

    .post('/guilds/:guild_id', async request => {
      if (!request.params.guild_id) {
        throw new Error('Guild ID not provided')
      }
      const guild = await getOrAddGuild(app, request.params.guild_id)
      await syncDiscordCommands(app, guild)
      return new Response(`Updated leaderborads app in guild ${guild?.data.name}`, { status: 200 })
    })
    .all('*', () => new Response('Init endpoint not found', { status: 404 }))
