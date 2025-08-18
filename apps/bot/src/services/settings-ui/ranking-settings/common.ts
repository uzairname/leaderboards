import { GuildRanking, Ranking } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext } from '@repo/discord'
import { RankingSettingsHandlers } from '.'
import { App } from '../../../setup/app'
import { ranking_settings_view_sig } from './view'

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
    label: '🔢 Rating Method',
    description: `Customize the algorithm by which players' ratings are calculated`,
    handler: RankingSettingsHandlers.sendRatingMethodSelectMenu,
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
