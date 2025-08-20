import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, StringSelectMenuBuilder } from '@discordjs/builders'
import { GuildRanking, Ranking } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext, Context, MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { settings_view_sig } from '../settings/view'
import * as RankingSettingsHandlers from './handlers'
import { onSettingSelect } from './handlers'
import { ranking_settings_view_sig } from './view'
import { DEFAULT_LB_COLOR } from '../../../api/rankings/properties'

export const settingsOptions: (gr: { guild_ranking: GuildRanking; ranking: Ranking }) => {
  [key: string]: {
    label: string
    description: string
    handler: (app: App, ctx: ComponentContext<typeof ranking_settings_view_sig>) => Promise<ChatInteractionResponse>
  }
} = gr => ({
  rename: {
    label: '✏️ Rename',
    description: 'Rename the ranking',
    handler: RankingSettingsHandlers.sendRenameModal,
  },
  match: {
    label: '🏆 Match Settings',
    description: `Customize how matches are recorded in this ranking`,
    handler: RankingSettingsHandlers.sendMatchSettingsPage,
  },
  rank_roles: {
    label: '👑 Rank Roles',
    description: `Assign roles based on players' ratings`,
    handler: RankingSettingsHandlers.sendRankRolesPage,
  },
  scoring: {
    label: '🔢 Rating Settings',
    description: `Customize the algorithm by which players' ratings are calculated`,
    handler: RankingSettingsHandlers.sendRatingSettingsPage,
  },
  appearance: {
    label: '🎨 Appearance',
    description: `Customize how the leaderboard looks`,
    handler: RankingSettingsHandlers.sendAppearancePage,
  },
  delete: {
    label: '🗑️ Delete',
    description: 'Delete the ranking',
    handler: RankingSettingsHandlers.sendDeletePage,
  },
})

export function makeSettingsPage(
  ctx: Context<typeof ranking_settings_view_sig>,
  containers: ContainerBuilder[],
  ranking: Ranking,
  guild_ranking: GuildRanking,
  back_to_settings = false,
): D.APIInteractionResponseCallbackData {
  containers.forEach(c =>
    c.setAccentColor(c.data.accent_color ?? guild_ranking.data.display_settings?.color ?? DEFAULT_LB_COLOR),
  )

  const setting_select_row = new ActionRowBuilder<StringSelectMenuBuilder>().setComponents(
    new StringSelectMenuBuilder({
      placeholder: 'Select a setting to change',
      custom_id: ctx.state.set.handler(onSettingSelect).cId(),
      options: Object.entries(settingsOptions({ guild_ranking, ranking })).map(([key, option]) => ({
        ...option,
        value: key,
        default: ctx.state.is.setting_key(key),
      })),
    }),
  )

  const back_btn_row = new ActionRowBuilder<ButtonBuilder>().setComponents(
    new ButtonBuilder({
      label: `Back`,
      style: D.ButtonStyle.Secondary,
      custom_id: back_to_settings
        ? settings_view_sig.newState().cId()
        : ctx.state
            .setAll({
              selected_role_id: null,
              handler: null,
              setting_key: null,
            })
            .cId(),
      emoji: { name: '⬅️' },
    }),
  )

  return new MessageData({
    components: [...containers.map(c => c.toJSON()), setting_select_row.toJSON(), back_btn_row.toJSON()],
  }).addFlags(D.MessageFlags.Ephemeral | D.MessageFlags.IsComponentsV2).response_data
}
