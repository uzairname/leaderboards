import { AppEvents } from '../../../app/AppEvents'

export default function (events: AppEvents) {
  events.GuildRankingsModified.on(async (app, guild) => {
    await app.syncDiscordCommands(guild)
  })
}
