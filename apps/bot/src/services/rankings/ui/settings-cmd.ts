import { PartialRanking } from '@repo/db/models'
import { CommandContext, CommandInteractionResponse, CommandSignature, getOptions } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { guildRankingsOption, withOptionalSelectedRanking } from '../../../utils/view-helpers/ranking-option'
import { renameModal } from './components'
import { queueSettingsPage, ranking_settings_view_sig, rankingSettingsPage } from './settings/ranking-settings-view'
import { rankingsPage } from './rankings-view'

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
          description: 'Which setting to change',
          choices: [
            {
              name: `Rename the ranking`,
              value: 'rename',
            },
            {
              name: `Customize rating algorithm`,
              value: `rating`,
            },
            {
              name: `Configure matchmaking queue`,
              value: `queue`,
            },
          ],
        },
      ]),
    })
  },

  onCommand: async (ctx, app) => {
    const input = getOptions(ctx.interaction, {
      ranking: { type: D.ApplicationCommandOptionType.Integer },
      setting: { type: D.ApplicationCommandOptionType.String },
    })

    return withOptionalSelectedRanking(
      {
        app,
        ctx,
        ranking_id: input.ranking,
      },
      async ranking => {
        if (ranking) {
          const setting_option_value = input.setting
          if (setting_option_value) {
            return routeToSettingPage(app, ctx, ranking, setting_option_value)
          } else {
            return {
              type: D.InteractionResponseType.ChannelMessageWithSource,
              data: await rankingSettingsPage(app, {
                ...ctx,
                state: ranking_settings_view_sig.newState({
                  ranking_id: ranking.data.id,
                }),
              }),
            }
          }
        } else {
          return {
            type: D.InteractionResponseType.ChannelMessageWithSource,
            data: await rankingsPage(app, ctx),
          }
        }
      },
    )
  },
})

/**
 * Redirects to the appropriate setting page, based on the selected setting option.
 */
async function routeToSettingPage(
  app: App,
  ctx: CommandContext<typeof settings_cmd_sig>,
  ranking: PartialRanking,
  setting: string,
): Promise<CommandInteractionResponse> {
  const state = ranking_settings_view_sig.newState({
    ranking_id: ranking.data.id,
  })

  switch (setting) {
    case 'rename':
      return await renameModal(app, {
        ...ctx,
        state,
      })
    case 'queue':
      return ctx.defer(async ctx => {
        await ctx.edit(await queueSettingsPage(app, { ...ctx, state }))
      })
  }

  throw new Error(`Unknwn setting ${setting}`)
}
