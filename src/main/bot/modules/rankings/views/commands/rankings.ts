import * as D from 'discord-api-types/v10'
import { _, AppCommand, field } from '../../../../../../discord-framework'
import { GuildCommand } from '../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../helpers/perms'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../../helpers/ranking_command_option'
import { getOrAddGuild } from '../../../guilds/guilds'
import { ranking_settings_page_config, rankingSettingsPage } from '../pages/ranking_settings'
import { rankingsPage } from '../pages/rankings'

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
      ...rankings_cmd_signature.config,
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
              data: await rankingSettingsPage(app, {
                state: ranking_settings_page_config.newState({
                  ranking_id: ranking.data.id,
                  guild_id: checkGuildInteraction(ctx.interaction).guild_id,
                }),
              }),
            }
          } else {
            const guild = await getOrAddGuild(app, checkGuildInteraction(ctx.interaction).guild_id)
            return {
              type: D.InteractionResponseType.ChannelMessageWithSource,
              data: await rankingsPage(app, guild),
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
          async ctx => ctx.edit(await rankingsPage(app, guild)),
        )
      })
  },
)
