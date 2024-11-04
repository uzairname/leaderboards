import * as D from 'discord-api-types/v10'
import { GuildRanking } from '../../../database/models'
import { PartialGuild } from '../../../database/models/guilds'
import { PartialRanking, Ranking } from '../../../database/models/rankings'
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
import { sentry } from '../../../logging/sentry'

export const create_ranking_choice_value = 'create'

/**
 * Returns a slash command option, wich thoices for each ranking in the guild.
 */
export async function guildRankingsOption(
  app: App,
  guild: PartialGuild,
  ranking_option_name = 'ranking',
  options?: {
    optional?: boolean
    available_choices?: Ranking[]
  },
  description: string = 'Select a ranking',
): Promise<D.APIApplicationCommandBasicOption[]> {
  const rankings_choices =
    options?.available_choices ??
    (await app.db.guild_rankings.fetch({ guild_id: guild.data.id })).map(i => i.ranking)

  if (rankings_choices.length == 1 && !options?.optional) {
    return []
  }

  const choices = rankings_choices.map(item => ({
    name: item.data.name,
    value: item.data.id.toString(),
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
    subcommand?: string
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking | undefined) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(app, ctx, ranking_option_name, options, callback)
}

export async function withSelectedRanking(
  app: App,
  ctx: InteractionContext<AnyAppCommand, D.APIChatInputApplicationCommandInteraction>,
  ranking_option_name: string,
  options: {
    subcommand?: string
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking) => Promise<CommandInteractionResponse>,
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
    subcommand?: string
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking | undefined) => Promise<CommandInteractionResponse>,
  required = false,
): Promise<CommandInteractionResponse> {
  const interaction = checkGuildInteraction(ctx.interaction)

  let ranking_option_value: string | undefined

  sentry.addBreadcrumb({
    message: `_withSelectedRanking`,
    data: {
      options: options,
      interaction: JSON.stringify(interaction.data),
    }
  })

  if (options.subcommand) {
    const subcmd_options = interaction.data.options as D.APIApplicationCommandInteractionDataSubcommandOption[]
    const subcmd = subcmd_options.find(o => o.name === options.subcommand)
    ranking_option_value = (
      subcmd?.options?.find(o => o.name === ranking_option_name) as
        | D.APIApplicationCommandInteractionDataStringOption
        | undefined
    )?.value
  } else {
    ranking_option_value = (
      interaction.data.options?.find(o => o.name === ranking_option_name) as
        | D.APIApplicationCommandInteractionDataStringOption
        | undefined
    )?.value
  }

  if (ranking_option_value && parseInt(ranking_option_value)) {
    var ranking: PartialRanking = await app.db.rankings.fetch(parseInt(ranking_option_value))
  } else {
    if (!required) {
      return callback(undefined)
    }
    const available_guild_rankings =
      options.available_guild_rankings !== undefined
        ? options.available_guild_rankings
        : await app.db.guild_rankings.fetch({
            guild_id: interaction.guild_id,
          })
    if (available_guild_rankings.length == 1) {
      ranking = available_guild_rankings[0].ranking
    } else if (available_guild_rankings.length == 0) {
      const guild = await getOrAddGuild(app, interaction.guild_id)
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await rankingsPage(app, guild, interaction.member?.user.id ?? interaction.member.user.id),
      }
    } else {
      throw new UserError('Please specify a ranking')
    }
  }

  return callback(ranking)
}
