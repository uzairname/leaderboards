import { Ranking } from '@repo/db/models'
import { DeferredCommandContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { getOrCreatePlayerByUser } from '../../manage'
import { player_cmd_sig } from './cmd'

export async function onPlayerBan(
  app: App,
  ctx: DeferredCommandContext<typeof player_cmd_sig>,
  user: D.APIUser,
  ranking?: Ranking,
) {
  const { players, rankings } = await (async () => {
    if (ranking) {
      // A ranking was selected
      const player = await getOrCreatePlayerByUser(app, user, ranking)
      return { players: [player], rankings: [await ranking.fetch()] }
    } else {
      // No ranking was selected. Act on all rankings in the guild.
      const guild_rankings = await app.db.guild_rankings.fetch({
        guild_id: ctx.interaction.guild_id,
      })
      return {
        players: await Promise.all(guild_rankings.map(item => getOrCreatePlayerByUser(app, user, item.ranking))).then(
          players => players.filter((p): p is NonNullable<typeof p> => !!p),
        ),
        rankings: guild_rankings.map(r => r.ranking),
      }
    }
  })()
}

export async function onPlayerRemove(
  app: App,
  ctx: DeferredCommandContext<typeof player_cmd_sig>,
  user: D.APIUser,
  ranking?: Ranking,
) {}
