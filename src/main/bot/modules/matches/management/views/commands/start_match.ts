import * as D from 'discord-api-types/v10'
import { AppCommand, field } from '../../../../../../../discord-framework'
import { GuildCommand } from '../../../../../../app/ViewModule'
import { UserError } from '../../../../../errors/UserError'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../../helpers/perms'
import {
  guildRankingsOption,
  withSelectedRanking,
} from '../../../../../helpers/ranking_command_option'
import { channelMention } from '../../../../../helpers/strings'
import { getOrCreatePlayer } from '../../../../players/manage_players'
import { start1v1SeriesThread } from '../../../ongoing-series/manage_ongoing_match'

export const start_match_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'start-match',
  description: 'Start a match between players',
  custom_id_prefix: 'sm',
  state_schema: {
    ranking_id: field.Int(),
    num_teams: field.Int(),
    players_per_team: field.Int(),
  },
})

const optionnames = {
  ranking: 'for',
  player1: 'player-1',
  player2: 'player-2',
}

export default new GuildCommand(
  start_match_cmd_signature,
  async (app, guild) => {
    const options: D.APIApplicationCommandOption[] = [
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

    return new AppCommand({
      ...start_match_cmd_signature.signature,
      options: options.concat(
        await guildRankingsOption(
          app,
          guild,
          optionnames.ranking,
          {},
          'Which ranking should this match belong to',
        ),
      ),
    })
  },
  app =>
    start_match_cmd_signature.onCommand(async ctx =>
      withSelectedRanking(app, ctx, optionnames.ranking, async ranking =>
        ctx.defer(
          {
            type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            data: { flags: D.MessageFlags.Ephemeral },
          },
          async ctx => {
            const interaction = checkGuildInteraction(ctx.interaction)
            await ensureAdminPerms(app, ctx)

            ctx.state.save.ranking_id(ranking.data.id)
            ctx.state.save.players_per_team(ranking.data.players_per_team)
            ctx.state.save.num_teams(ranking.data.num_teams)

            if (ctx.state.is.players_per_team(1) && ctx.state.is.num_teams(2)) {
              // If this is a 1v1 ranking, check if both players were selected

              const p1_id = (
                interaction.data.options?.find(o => o.name === optionnames.player1) as
                  | D.APIApplicationCommandInteractionDataUserOption
                  | undefined
              )?.value

              const p2_id = (
                interaction.data.options?.find(o => o.name === optionnames.player2) as
                  | D.APIApplicationCommandInteractionDataUserOption
                  | undefined
              )?.value

              if (p1_id && p2_id) {
                // start a match

                const guild_ranking = await app.db.guild_rankings.get({
                  guild_id: interaction.guild_id,
                  ranking_id: ranking.data.id,
                })

                const team_players = await Promise.all(
                  [[p1_id], [p2_id]].map(async team => {
                    return Promise.all(team.map(id => getOrCreatePlayer(app, id, ranking)))
                  }),
                )

                const { match, thread } = await start1v1SeriesThread(
                  app,
                  guild_ranking,
                  team_players,
                )

                return void (await ctx.edit({
                  content: `Match started. A thread has been created: ${channelMention(thread.id)}`,
                  flags: D.MessageFlags.Ephemeral,
                }))
              }
            }

            throw new UserError('Select the players for the match')
          },
        ),
      ),
    ),
)