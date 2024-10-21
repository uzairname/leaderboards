import * as D from 'discord-api-types/v10'
import type {
  AnyAppCommand,
  CommandInteractionResponse,
  InteractionContext,
} from '../../../../discord-framework'
import type { App } from '../../../context/app_context'
import { Ranking } from '../../../database/models'
import { checkGuildInteraction } from '../../utils/perms'
import { UserError } from '../../utils/user-facing-errors'
import { rankings_cmd_base } from '../rankings/views/commands/rankings'
import { allGuildRankingsPage } from '../rankings/views/pages/all_rankings'
import { create_ranking_view, createRankingModal } from '../rankings/views/pages/create_ranking'

export const create_ranking_choice_value = 'create'

/**
 * Returns a slash command option, wich thoices for each ranking in the guild.
 */
export async function guildRankingsOption(
  app: App,
  guild_id: string,
  ranking_option_name = 'ranking',
  include_create_ranking_choice?: boolean,
  description: string = include_create_ranking_choice
    ? 'Select a ranking or create a new one'
    : 'Select a ranking',
): Promise<D.APIApplicationCommandOption[]> {
  const guild_rankings = await app.db.guild_rankings.get({ guild_id })

  if (guild_rankings.length == 1) {
    return []
  }

  const choices = guild_rankings.map(item => ({
    name: item.ranking.data.name ?? 'Unnamed Ranking',
    value: item.ranking.data.id.toString(),
  }))

  if (include_create_ranking_choice) {
    choices.push({
      name: 'Create a new ranking',
      value: create_ranking_choice_value,
    })
  }

  if (choices.length == 0) {
    return []
  }

  return [
    {
      type: D.ApplicationCommandOptionType.String,
      name: ranking_option_name,
      description,
      choices,
    },
  ]
}

export async function withSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  callback: (ranking: Ranking) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const ranking_option_value = (
    interaction.data.options?.find(o => o.name === ranking_option_name) as
      | D.APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  if (ranking_option_value == create_ranking_choice_value) {
    return createRankingModal(app, { state: create_ranking_view.newState({}) })
  }

  if (ranking_option_value && parseInt(ranking_option_value)) {
    var ranking = await app.db.rankings.get(parseInt(ranking_option_value))
  } else {
    const guild_rankings = await app.db.guild_rankings.get({
      guild_id: interaction.guild_id,
    })
    if (guild_rankings.length == 1) {
      ranking = guild_rankings[0].ranking
    } else if (guild_rankings.length == 0) {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await allGuildRankingsPage(app, {
          interaction,
          state: rankings_cmd_base.newState(),
        }),
      }
    } else {
      throw new UserError('Please specify a ranking to record the match for')
    }
  }

  return callback(ranking)
}
