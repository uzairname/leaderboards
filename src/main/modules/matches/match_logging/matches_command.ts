import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../discord-framework'
import { App } from '../../../app/app'
import { guildRankingsOptionChoices } from '../../../views/utils/common'
import { match_history_view_def, matchesPage } from './matches_view'

export const matches_command_def = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  name: 'matches',
  description: 'View the match history',
})

const option_names = {
  ranking: 'ranking',
  user: 'player',
}

export const matchesCommand = (app: App) =>
  matches_command_def.onCommand(async ctx => {
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

    return ctx.defer(
      {
        type: D.InteractionResponseType.DeferredChannelMessageWithSource,
        data: { flags: D.MessageFlags.Ephemeral },
      },
      async ctx => {
        await ctx.edit(
          await matchesPage(
            app,
            match_history_view_def.newState({
              ranking_ids: ranking_option_value ? [parseInt(ranking_option_value)] : undefined,
              user_ids: user_option_value ? [user_option_value] : undefined,
            }),
          ),
        )
      },
    )
  })

export const matchesCommandDef = async (app: App, guild_id?: string) =>
  guild_id
    ? new AppCommand({
        ...matches_command_def.options,
        options: [
          {
            type: D.ApplicationCommandOptionType.String,
            name: option_names.ranking,
            description: 'Filter matches by ranking',
            choices: await guildRankingsOptionChoices(app, guild_id, false),
          },
          {
            name: option_names.user,
            type: D.ApplicationCommandOptionType.User,
            description: 'Filter matches by player',
          },
        ],
      })
    : undefined
