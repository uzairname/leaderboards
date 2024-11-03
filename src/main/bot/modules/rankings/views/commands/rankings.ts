import * as D from 'discord-api-types/v10'
import { _, AppCommand, field } from '../../../../../../discord-framework'
import { GuildCommand } from '../../../../../app/ViewModule'
import { checkGuildInteraction } from '../../../../ui-helpers/perms'
import {
  guildRankingsOption,
  withOptionalSelectedRanking,
} from '../../../../ui-helpers/ranking-command-option'
import { getOrAddGuild } from '../../../guilds/guilds'
import { rankingSettingsPage } from '../pages/ranking-settings'
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
  description: 'Create and edit rankings in this server',
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
        withOptionalSelectedRanking(app, ctx, ranking_option_name, {}, async ranking => {
          return ctx.defer(
            {
              type: D.InteractionResponseType.DeferredChannelMessageWithSource,
            },
            async ctx => {
              const interaction = checkGuildInteraction(ctx.interaction)
              if (ranking) {
                return void ctx.followup(
                  await rankingSettingsPage(app, {
                    ranking_id: ranking.data.id,
                    guild_id: checkGuildInteraction(ctx.interaction).guild_id,
                    component_owner_id: interaction.member.user.id,
                  }),
                )
              } else {
                const guild = await getOrAddGuild(
                  app,
                  interaction.guild_id,
                )
                return void ctx.followup(await rankingsPage(app, guild, interaction.member.user.id))
              }
            },
          )
        }),
      )

      .onComponent(async ctx => {
        const interaction = checkGuildInteraction(ctx.interaction)
        const guild = await getOrAddGuild(app, interaction.guild_id)
        return ctx.defer(
          {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: { content: 'Loading...' },
          },
          async ctx => ctx.edit(await rankingsPage(app, guild, interaction.member.user.id)),
        )
      })
  },
)
