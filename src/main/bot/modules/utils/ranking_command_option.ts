import * as D from 'discord-api-types/v10'
import type {
  AnyAppCommand,
  CommandInteractionResponse,
  InteractionContext,
} from '../../../../discord-framework'
import type { App } from '../../../context/app_context'
import { Ranking } from '../../../database/models'
import { checkGuildInteraction } from '../../utils/perms'
import { UserError } from '../../utils/UserError'
import { getOrAddGuild } from '../guilds'
import { allGuildRankingsPage } from '../rankings/views/pages/all_rankings'

export const create_ranking_choice_value = 'create'

/**
 * Returns a slash command option, wich thoices for each ranking in the guild.
 */
export async function guildRankingsOption(
  app: App,
  guild_id: string,
  ranking_option_name = 'ranking',
  options?: {
    allow_single_ranking?: boolean
  },
  description: string = 'Select a ranking',
): Promise<D.APIApplicationCommandOption[]> {
  const guild_rankings = await app.db.guild_rankings.get({ guild_id })

  if (guild_rankings.length == 1 && !options?.allow_single_ranking) {
    return []
  }

  const choices = guild_rankings.map(item => ({
    name: item.ranking.data.name ?? 'Unnamed Ranking',
    value: item.ranking.data.id.toString(),
  }))

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

export async function withOptionalSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  callback: (ranking: Ranking | undefined) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(app, ctx, ranking_option_name, callback, true)
}

export async function withSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  callback: (ranking: Ranking) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(
    app,
    ctx,
    ranking_option_name,
    async ranking => callback(ranking!),
    false,
  )
}

async function _withSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  callback: (ranking: Ranking | undefined) => Promise<CommandInteractionResponse>,
  required = false,
): Promise<CommandInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  const ranking_option_value = (
    interaction.data.options?.find(o => o.name === ranking_option_name) as
      | D.APIApplicationCommandInteractionDataStringOption
      | undefined
  )?.value

  if (ranking_option_value && parseInt(ranking_option_value)) {
    var ranking = await app.db.rankings.get(parseInt(ranking_option_value))
  } else {
    if (required) {
      return callback(undefined)
    }
    const guild_rankings = await app.db.guild_rankings.get({
      guild_id: interaction.guild_id,
    })
    if (guild_rankings.length == 1) {
      ranking = guild_rankings[0].ranking
    } else if (guild_rankings.length == 0) {
      const guild = await getOrAddGuild(app, interaction.guild_id)
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await allGuildRankingsPage(app, guild),
      }
    } else {
      throw new UserError('Please specify a ranking')
    }
  }

  return callback(ranking)
}
