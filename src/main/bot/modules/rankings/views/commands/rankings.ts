import * as D from 'discord-api-types/v10'
import { _, AppCommand, field } from '../../../../../../discord-framework'
import { GuildCommand } from '../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../helpers/perms'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../../helpers/ranking_command_option'
import { getOrAddGuild } from '../../../guilds/guilds'
import { allGuildRankingsPage } from '../pages/all_rankings'
import {
  guildRankingSettingsPage,
  ranking_settings_view_signature,
} from '../pages/ranking_settings'

const ranking_option_name = 'ranking'

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

export default new GuildCommand(
  rankings_cmd_signature,
  async (app, guild) =>
    new AppCommand({
      ...rankings_cmd_signature.signature,
      options: await guildRankingsOption(app, guild, ranking_option_name, {
        optional: true,
      }),
    }),
  app => {
    return rankings_cmd_signature
      .onCommand(async ctx =>
        withOptionalSelectedRanking(app, ctx, ranking_option_name, async ranking => {
          if (ranking) {
            return {
              type: D.InteractionResponseType.ChannelMessageWithSource,
              data: await guildRankingSettingsPage(app, {
                state: ranking_settings_view_signature.createState({
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
        }),
      )

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
  },
)
