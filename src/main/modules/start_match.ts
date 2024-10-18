import * as D from 'discord-api-types/v10'
import { Ranking } from '../../database/models'
import {
  CommandContext,
  CommandInteractionResponse,
  AppCommandDefinition,
  field,
  _,
} from '../../discord-framework'
import { nonNullable } from '../../utils/utils'
import { App } from '../app-context/app-context'
import { AppError } from '../errors'
import { allGuildRankingsPage } from './rankings/rankings_commands/all_rankings'
import {
  createRankingModal,
  create_ranking_view_definition,
} from './rankings/rankings_commands/create_ranking'
import { rankings_cmd_def } from './rankings/rankings_commands/rankings_cmd'
import { checkGuildInteraction, ensureAdminPerms } from '../utils/checks'
import { rankingsAutocomplete } from '../utils/view_pieces'

const optionnames = {
  ranking: 'for',
  player1: 'player-1',
  player2: 'player-2',
}

const start_match_command = new AppCommandDefinition({
  type: D.ApplicationCommandType.ChatInput,
  name: 'startmatch',
  description: 'description',
  custom_id_prefix: 'sm',
  options: [
    {
      name: optionnames.ranking,
      description: `Ranking to record the match for (Leave blank for default)`,
      type: D.ApplicationCommandOptionType.String,
      autocomplete: true,
    },
    {
      name: optionnames.player1,
      description: `Player 1 (Optional if more than 2 players)`,
      type: D.ApplicationCommandOptionType.User,
    },
    {
      name: optionnames.player2,
      description: `Player 2 (Optional if more than 2 players)`,
      type: D.ApplicationCommandOptionType.User,
    },
  ],
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

export const startMatchCmd = (app: App) =>
  start_match_command.onAutocomplete(rankingsAutocomplete(app)).onCommand(async ctx => {
    return onCommand(app, ctx)
  })

async function onCommand(
  app: App,
  ctx: CommandContext<typeof start_match_command>,
): Promise<CommandInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const ranking_option_value = (
    interaction.data.options?.find(o => o.name === optionnames.ranking) as
      | D.APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  if (ranking_option_value == 'create') {
    return createRankingModal(app, { state: create_ranking_view_definition.newState({}) })
  }

  await ensureAdminPerms(app, ctx)

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: D.MessageFlags.Ephemeral },
    },
    async ctx => {
      let ranking: Ranking
      if (ranking_option_value) {
        ranking = await app.db.rankings.get(parseInt(ranking_option_value))
      } else {
        const res = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })
        if (res.length == 1) {
          ranking = res[0].ranking
        } else if (res.length == 0) {
          return void (await ctx.edit(
            await allGuildRankingsPage(app, { interaction, state: rankings_cmd_def.newState() }),
          ))
        } else {
          throw new AppError('Please specify a ranking to record the match for')
        }
      }

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
  )
}
