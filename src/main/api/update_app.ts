import { Router } from 'itty-router'
import { sentry } from '../../logging/sentry'
import { App } from '../app/App'
import { getOrAddGuild, updateGuild } from '../bot/modules/guilds/guilds'
import { getAppRoleConnectionsMetadata } from '../bot/modules/linked-roles/linked_roles'

export const updateRouter = (app: App) =>
  Router({ base: '/update' })
    .post('/', async () => {
      await app.db.settings.getOrUpdate({
        last_updated: true,
        guilds: true,
      })

      const [_, guild_names] = await Promise.all([
        app.syncDiscordCommands(),
        app.db.guilds
          .getAll()
          .then(guilds =>
            Promise.all(
              guilds.map(guild => updateGuild(app, guild).then(() => guild.data.name)),
            ).then(res => res.filter(c => c !== undefined)),
          ),
        app.discord.updateRoleConnectionsMetadata(getAppRoleConnectionsMetadata(app)),
      ])

      sentry.addBreadcrumb({
        message: `Updated Leaderboards app in ${guild_names.length} guilds`,
        data: { guild_names },
      })
      return new Response(`Successfully updated Leaderboards app (${guild_names.length} guilds)`, {
        status: 200,
      })
    })
    .post('/guilds/:guild_id', async request => {
      if (!request.params.guild_id) {
        throw new Error('Guild ID not provided')
      }
      await app.syncDiscordCommands(await getOrAddGuild(app, request.params.guild_id))
      const guild = await app.db.guilds.get(request.params.guild_id)
      return new Response(`Updated leaderborads app in guild ${guild?.data.name}`, { status: 200 })
    })
    .all('*', () => new Response('Init endpoint not found', { status: 404 }))
