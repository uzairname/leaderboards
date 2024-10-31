import * as D from 'discord-api-types/v10'
import { Guild, GuildRanking, Ranking } from '../../../database/models'
import type {
  AnyAppCommand,
  CommandInteractionResponse,
  InteractionContext,
} from '../../../discord-framework'
import type { App } from '../../app/App'
import { UserError } from '../errors/UserError'
import { getOrAddGuild } from '../modules/guilds/guilds'
import { rankingsPage } from '../modules/rankings/views/pages/rankings'
import { checkGuildInteraction } from './perms'

export const create_ranking_choice_value = 'create'

/**
 * Returns a slash command option, wich thoices for each ranking in the guild.
 */
export async function guildRankingsOption(
  app: App,
  guild: Guild,
  ranking_option_name = 'ranking',
  options?: {
    optional?: boolean
    available_choices?: { id: number; name: string }[]
  },
  description: string = 'Select a ranking',
): Promise<D.APIApplicationCommandOption[]> {
  const rankings_choices =
    options?.available_choices ??
    (await app.db.guild_rankings.get({ guild_id: guild.data.id })).map(i => ({
      id: i.ranking.data.id,
      name: i.ranking.data.name,
    }))

  if (rankings_choices.length == 1 && !options?.optional) {
    return []
  }

  const choices = rankings_choices.map(item => ({
    name: item.name,
    value: item.id.toString(),
  }))

  if (choices.length == 0) {
    return []
  }

  return [
    {
      type: D.ApplicationCommandOptionType.String,
      name: ranking_option_name,
      description,
      required: !options?.optional,
      choices,
    },
  ]
}

export async function withOptionalSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  options: {
    available_guild_rankings?: {
      ranking: Ranking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: Ranking | undefined) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(app, ctx, ranking_option_name, options, callback)
}

export async function withSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  options: {
    available_guild_rankings?: {
      ranking: Ranking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: Ranking) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(
    app,
    ctx,
    ranking_option_name,
    options,
    async ranking => callback(ranking!),
    true,
  )
}

async function _withSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  options: {
    available_guild_rankings?: {
      ranking: Ranking
      guild_ranking: GuildRanking
    }[]
  },
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
    if (!required) {
      return callback(undefined)
    }
    const available_guild_rankings =
      options.available_guild_rankings !== undefined
        ? options.available_guild_rankings
        : await app.db.guild_rankings.get({
            guild_id: interaction.guild_id,
          })
    if (available_guild_rankings.length == 1) {
      ranking = available_guild_rankings[0].ranking
    } else if (available_guild_rankings.length == 0) {
      const guild = await getOrAddGuild(app, interaction.guild_id)
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await rankingsPage(app, guild),
      }
    } else {
      throw new UserError('Please specify a ranking')
    }
  }

  return callback(ranking)
}
