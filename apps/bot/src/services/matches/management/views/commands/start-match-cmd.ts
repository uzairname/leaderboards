import { CommandSignature, getOptions, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../../../../errors/user-errors'
import { App } from '../../../../../setup/app'
import { ensureAdminPerms } from '../../../../../utils/perms'
import { guildRankingsOption, withSelectedRanking } from '../../../../../utils/view-helpers/ranking-option'
import { getRegisterPlayer } from '../../../../players/manage-players'
import { start1v1SeriesThread } from '../../../ongoing-math-thread/manage-ongoing-match'

export const start_match_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'start-match',
  description: 'Start a match between players',
})

const optionnames = {
  ranking: 'for',
  player1: 'player-1',
  player2: 'player-2',
}

export const start_match_cmd = start_match_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    const guild_rankings = await app.db.guild_rankings.getBy({ guild_id: guild.data.id })
    if (guild_rankings.length == 0) return null

    const options: D.APIApplicationCommandBasicOption[] = [
      {
        name: optionnames.player1,
        description: `Player 1`,
        type: D.ApplicationCommandOptionType.User,
      },
      {
        name: optionnames.player2,
        description: `Player 2`,
        type: D.ApplicationCommandOptionType.User,
      },
    ]

    return new CommandSignature({
      ...start_match_cmd_sig.config,
      options: (
        await guildRankingsOption(app, guild, optionnames.ranking, {}, 'Which ranking should this match belong to')
      ).concat(options),
    })
  },
  onCommand: (ctx, app) =>{
    const input = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer, name: optionnames.ranking },
      p1_id: { type: D.ApplicationCommandOptionType.User, name: optionnames.player1 },
      p2_id: { type: D.ApplicationCommandOptionType.User, name: optionnames.player2 },
    })

    return withSelectedRanking({
      app,
      ctx,
      ranking_id: input.ranking
    }, async p_ranking =>
        ctx.defer(async ctx => {
          await ensureAdminPerms(app, ctx)

          const ranking = await p_ranking.fetch()

          if (ranking.data.players_per_team === 1 && ranking.data.teams_per_match === 2) {
            // If this is a 1v1 ranking, check if both players were selected

            const p1_id = (
              ctx.interaction.data.options?.find(o => o.name === optionnames.player1) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value

            const p2_id = (
              ctx.interaction.data.options?.find(o => o.name === optionnames.player2) as
                | D.APIApplicationCommandInteractionDataUserOption
                | undefined
            )?.value

            if (p1_id && p2_id) {
              // start a match

              const team_players = await Promise.all(
                [[p1_id], [p2_id]].map(async team => {
                  return Promise.all(team.map(id => getRegisterPlayer(app, id, ranking)))
                }),
              )
              const { thread } = await start1v1SeriesThread(
                app,
                app.db.guild_rankings.get(ctx.interaction.guild_id, ranking.data.id),
                team_players,
              )

              return void (await ctx.edit({
                content: `Match started. A thread has been created: <#${thread.id}>`,
                flags: D.MessageFlags.Ephemeral,
              }))
            }
          }

          throw new UserError('Select the players for the match')
        })
    )}
})