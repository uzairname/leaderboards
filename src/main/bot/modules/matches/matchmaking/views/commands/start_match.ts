import * as D from 'discord-api-types/v10'
import { AppCommand, _, field } from '../../../../../../../discord-framework'
import { nonNullable } from '../../../../../../../utils/utils'
import { App } from '../../../../../../context/app_context'
import { checkGuildInteraction, ensureAdminPerms } from '../../../../../utils/perms'
import { AppView } from '../../../../../utils/view_module'
import { guildRankingsOption, withSelectedRanking } from '../../../../utils/ranking_command_option'

const start_match_command = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'startmatch',
  description: 'description',
  custom_id_prefix: 'sm',
  state_schema: {
    ranking_id: field.Int(),
    component: field.Enum({
      'select:team': _,
      'btn:confirm teams': _,
    }),
    num_teams: field.Int(),
    players_per_team: field.Int(),
    // index of the team being selected (0-indexed)
    selected_team_idx: field.Int(),
  },
})

const optionnames = {
  ranking: 'for',
  player1: 'player-1',
  player2: 'player-2',
}

const startMatchCommandInGuild = async (app: App, guild_id: string) => {
  let options: D.APIApplicationCommandOption[] = [
    {
      name: optionnames.player1,
      description: `Player 1 (Optional)`,
      type: D.ApplicationCommandOptionType.User,
    },
    {
      name: optionnames.player2,
      description: `Player 2 (Optional)`,
      type: D.ApplicationCommandOptionType.User,
    },
  ]

  options = options.concat(
    await guildRankingsOption(
      app,
      guild_id,
      optionnames.ranking,
      false,
      'Which ranking should this match belong to',
    ),
  )

  return new AppCommand({
    ...start_match_command.options,
    options,
  })
}
const startMatchCommand = (app: App) =>
  start_match_command.onCommand(async ctx =>
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
          ctx.state.save.players_per_team(
            nonNullable(ranking.data.players_per_team, 'players_per_team'),
          )
          ctx.state.save.num_teams(nonNullable(ranking.data.num_teams, 'num_teams'))

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
              return void (await ctx.edit({
                content: `Starting match between <@${p1_id}> and <@${p2_id}> for ${ranking.data.name}...`,
                flags: D.MessageFlags.Ephemeral,
              }))
            }
          }
          // Otherwise, select teams
        },
      ),
    ),
  )

export default new AppView(startMatchCommand, startMatchCommandInGuild)
