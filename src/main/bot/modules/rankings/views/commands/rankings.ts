import * as D from 'discord-api-types/v10'
import { _, AppCommand, field } from '../../../../../../discord-framework'
import { App } from '../../../../../context/app_context'
import { checkGuildInteraction } from '../../../../utils/perms'
import { AppView } from '../../../../utils/ViewModule'
import { getOrAddGuild } from '../../../guilds'
import {
  create_ranking_choice_value,
  guildRankingsOption,
} from '../../../utils/ranking_command_option'
import { allGuildRankingsPage } from '../pages/all_rankings'
import { create_ranking_view, createRankingModal } from '../pages/create_ranking'
import { guildRankingSettingsPage, ranking_settings_view } from '../pages/ranking_settings'

export const rankings_cmd_signature = new AppCommand({
  type: D.ApplicationCommandType.ChatInput,
  custom_id_prefix: 'r',
  name: 'rankings',
  state_schema: {
    on_page: field.Enum({
      all_rankings: _,
    }),
  },
  description: 'Create and manage rankings in this server',
})

const ranking_option_name = 'ranking'

export const rankingsCommandInGuild = async (app: App, guild_id: string) =>
  new AppCommand({
    ...rankings_cmd_signature.options,
    options: [
      (await guildRankingsOption(app, guild_id, ranking_option_name, {
        allow_single_ranking: true,
      })) ?? [],
    ].flat(),
  })

export const rankingsCommand = (app: App) => {
  return rankings_cmd_signature
    .onCommand(async ctx => {
      const ranking_option_value = (
        ctx.interaction.data.options?.find(o => o.name === ranking_option_name) as
          | D.APIApplicationCommandInteractionDataStringOption
          | undefined
      )?.value

      if (ranking_option_value === create_ranking_choice_value) {
        return createRankingModal(app, { state: create_ranking_view.newState() })
      }

      if (ranking_option_value) {
        const ranking = await app.db.rankings.get(parseInt(ranking_option_value))
        return {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: await guildRankingSettingsPage(app, {
            state: ranking_settings_view.newState({
              ranking_id: ranking.data.id,
              guild_id: checkGuildInteraction(ctx.interaction).guild_id,
              ranking_name: ranking.data.name,
            }),
          }),
        }
      } else {
        const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)
        return {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: await allGuildRankingsPage(app, guild),
        }
      }
    })

    .onComponent(async ctx => {
      const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)
      return ctx.defer(
        {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: { content: 'Loading...' },
        },
        async ctx => ctx.edit(await allGuildRankingsPage(app, guild)),
      )
    })
}

export default new AppView(rankingsCommand, rankingsCommandInGuild)
