import { ChatInteractionResponse, ComponentContext } from '@repo/discord'
import { RankingSettingsHandlers } from '.'
import { GuildRanking } from '../../../../../../../packages/db/src/models/guild-rankings'
import { Ranking } from '../../../../../../../packages/db/src/models/rankings'
import { App } from '../../../../setup/app'
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
  queue: {
    label: `🔎 Matchmaking Queue`,
    description: `Customize the matchmaking queue`,
    handler: RankingSettingsHandlers.sendQueueSettingsPage,
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
  leaderboard: {
    label: gr.guild_ranking.data.display_settings?.leaderboard_message
      ? `📃 Disable Live Leaderboard`
      : `📃 Enable Live Leaderboard`,
    description: gr.guild_ranking.data.display_settings?.leaderboard_message
      ? `Stop maintaining the live leaderboard message`
      : `Send a leaderboard message, and update it live`,
    handler: RankingSettingsHandlers.onToggleLiveLeaderboard,
  },
  challenge: {
    label: gr.ranking.data.matchmaking_settings?.direct_challenge_enabled
      ? `⚔️ Disable Direct Challenges`
      : `⚔️ Enable Direct Challenges`,
    description: gr.ranking.data.matchmaking_settings?.direct_challenge_enabled
      ? `Don't allow players to use /1v1 in this ranking`
      : `Allow players to use /1v1 in this ranking`,
    handler: RankingSettingsHandlers.onToggleChallenge,
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
