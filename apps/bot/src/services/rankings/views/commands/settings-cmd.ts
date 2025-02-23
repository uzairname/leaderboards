import { CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../../utils/view-helpers/ranking-option'
import { getRankingSettingsPage } from '../ranking-settings-view'
import { rankingsPage } from '../rankings-view'

export const settings_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'settings',
  description: 'Create and edit rankings in this server',
  guild_only: true,
})

export const settings_cmd = settings_cmd_sig.set<App>({
  guildSignature: async (app, guild_id) => {
    const guild = app.db.guilds.get(guild_id)
    return new CommandSignature({
      ...settings_cmd_sig.config,
      options: (
        await guildRankingsOption(app, guild, 'ranking', {
          optional: true,
        })
      ).concat([
        {
          type: D.ApplicationCommandOptionType.String,
          name: 'setting',
          description: 'What setting to change',
          choices: [
            {
              name: `Rename`,
              value: 'rename',
            },
            {
              name: `Change scoring method`,
              value: `scoring`,
            },
            {
              name: `Enable/disable queue`,
              value: `queue`,
            },
          ],
        },
      ]),
    })
  },
  onCommand: async (ctx, app) =>
    withOptionalSelectedRanking(
      app,
      ctx,
      getOptions(ctx.interaction, { ranking: { type: D.ApplicationCommandOptionType.Integer } }).ranking,
      {},
      async ranking => {
        return ctx.defer(async ctx => {
            if (ranking) {
              const setting_option_value = getOptions(ctx.interaction, {
                setting: { type: D.ApplicationCommandOptionType.String },
              }).setting
              if (setting_option_value) {
              } else {
                await ctx.followup(await getRankingSettingsPage({ app, ctx, ranking_id: ranking.data.id }))
              }
            } else {
              await ctx.followup(await rankingsPage(app, ctx))
            }
          },
        )
      },
    ),

  onComponent: async (ctx, app) => {
    return ctx.defer(async ctx => ctx.edit(await rankingsPage(app, ctx)),
    )
  },
})

// /**
//  * Redirects to the appropriate setting page, based on the selected setting option.
//  */
// export async function rankingSettingPageFromCmd(
//   app: App,
//   ranking: Ranking,
//   setting: string,
// ): Promise<ChatInteractionResponse> {
//   switch (setting) {
//     case 'rename':
//       return {
//         type: D.InteractionResponseType.Modal,
//         data: {
//           title: `Rename ${ranking.data.name}`,
//           custom_id: ranking_settings_page.newState({ handler: onSettingsModalSubmit }).cId(),
//           components: rankingSettingsModal({
//             name: { current: ranking.data.name },
//           }),
//         },
//       }
//   }
// }
