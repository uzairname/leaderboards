import { GuildRanking, PartialGuild, PartialRanking, Ranking } from '@repo/db/models'
import type { AnyAppCommandType, CommandContext, CommandInteractionResponse, CommandSignature } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { UserError } from '../../errors/user-errors'
import { sentry } from '../../logging/sentry'
import { rankingsPage } from '../../services/rankings//views/rankings-view'
import type { App } from '../../setup/app'

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
    options?.available_choices ?? (await app.db.guild_rankings.getBy({ guild_id: guild.data.id })).map(i => i.ranking)

  if (rankings_choices.length == 1 && !options?.optional) {
    return []
  }

  const choices = rankings_choices.map(item => ({
    name: item.data.name,
    value: item.data.id,
  }))

  if (choices.length == 0) {
    return []
  }

  return [
    {
      type: D.ApplicationCommandOptionType.Integer,
      name: ranking_option_name,
      description,
      required: !options?.optional,
      choices,
    },
  ]
}

export async function withOptionalSelectedRanking(
  options: {
    app: App
    ctx: CommandContext<CommandSignature<any, AnyAppCommandType, true>>
    ranking_id: number | undefined
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking | undefined) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(options, callback, true)
}

export async function withSelectedRanking(
  options: {
    app: App
    ctx: CommandContext<CommandSignature<any, AnyAppCommandType, true>>
    ranking_id: number | undefined
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking) => Promise<CommandInteractionResponse>,
): Promise<CommandInteractionResponse> {
  return _withSelectedRanking(options, async ranking => callback(ranking!), false)
}

/**
 * Calls the callback with the selected ranking as an argument.
 * If no ranking is selected, does one of the following:
 *  - if ranking is optional, passes undefined to the callback.
 *  - if there is one ranking in the guild, uses that.
 *  - if there are none, redirects to the all rankings page
 *  - if there are multiple, throws an error
 *
 * @param app
 * @param ctx interaction context for command
 * @param selected_ranking_id
 * @param options specify to limit the available rankings
 * @param callback the interaction callback
 * @param optional if false, throws an error if no ranking can be selected
 * @returns
 */
async function _withSelectedRanking(
  options: {
    app: App
    ctx: CommandContext<CommandSignature<any, AnyAppCommandType, true>>
    ranking_id: number | undefined
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking | undefined) => Promise<CommandInteractionResponse>,
  optional: boolean,
): Promise<CommandInteractionResponse> {
  const { app, ctx, ranking_id, available_guild_rankings } = options

  sentry.addBreadcrumb({
    message: `_withSelectedRanking`,
    data: {
      options: options,
      interaction: JSON.stringify(ctx.interaction.data),
    },
  })

  let ranking: PartialRanking | undefined
  if (ranking_id !== undefined) {
    ranking = await app.db.rankings.fetch(ranking_id)
  } else {
    if (optional) {
      return callback(undefined)
    }
    const available_guild_rankings_ =
      available_guild_rankings !== undefined
        ? available_guild_rankings
        : await app.db.guild_rankings.getBy({ guild_id: ctx.interaction.guild_id })

    if (available_guild_rankings_.length == 1) {
      ranking = available_guild_rankings_[0].ranking
    } else if (available_guild_rankings_.length == 0) {
      return {
        type: D.InteractionResponseType.ChannelMessageWithSource,
        data: await rankingsPage(app, ctx),
      }
    } else {
      throw new UserError('Please specify a ranking')
    }
  }

  return callback(ranking)
}
