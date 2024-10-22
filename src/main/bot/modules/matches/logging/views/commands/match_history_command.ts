import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { App } from '../../../../../../context/app_context'
import { checkGuildInteraction } from '../../../../../utils/perms'
import { AppView } from '../../../../../utils/ViewModule'
import { guildRankingsOption } from '../../../../utils/ranking_command_option'
import { match_view_def, matchPage } from '../pages/match_view'
import { matches_view, matchesPage } from '../pages/matches_view'

export const matches_command_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'matches',
  description: 'View the match history',
})

const option_names = {
  ranking: 'ranking',
  user: 'player',
  match_id: 'id',
}

const matchesCommandInGuild = async (app: App, guild_id: string) => {
  let options: D.APIApplicationCommandOption[] = [
    {
      name: option_names.user,
      type: D.ApplicationCommandOptionType.User,
      description: 'Filter matches by player',
    },
    {
      name: option_names.match_id,
      type: D.ApplicationCommandOptionType.Integer,
      description: 'View details or manage a specific match',
    },
  ]

  options = options.concat(
    await guildRankingsOption(app, guild_id, option_names.ranking, {}, 'filter matches by ranking'),
  )

  return new AppCommand({
    ...matches_command_signature.options,
    options,
  })
}

const matchesCommand = (app: App) =>
  matches_command_signature.onCommand(async ctx => {
    const ranking_option_value =
      (
        ctx.interaction.data.options?.find(o => o.name === option_names.ranking) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value ?? undefined

    const user_option_value =
      (
        ctx.interaction.data.options?.find(o => o.name === option_names.user) as
          | D.APIApplicationCommandInteractionDataUserOption
          | undefined
      )?.value ?? undefined

    const match_id_option_value =
      (
        ctx.interaction.data.options?.find(o => o.name === option_names.match_id) as
          | D.APIApplicationCommandInteractionDataIntegerOption
          | undefined
      )?.value ?? undefined

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        if (match_id_option_value !== undefined) {
          return void ctx.edit(
            await matchPage(app, {
              state: match_view_def.newState({ match_id: match_id_option_value }),
            }),
          )
        }

        let ranking_ids = ranking_option_value ? [parseInt(ranking_option_value)] : undefined
        if (!ranking_option_value) {
          const rankings = await app.db.guild_rankings.get({
            guild_id: checkGuildInteraction(ctx.interaction).guild_id,
          })
          ranking_ids = rankings.map(r => r.ranking.data.id)
        }

        await ctx.edit(
          await matchesPage(
            app,
            matches_view.newState({
              ranking_ids,
              user_ids: user_option_value ? [user_option_value] : undefined,
            }),
          ),
        )
      },
    )
  })

export default new AppView(matchesCommand, matchesCommandInGuild)
