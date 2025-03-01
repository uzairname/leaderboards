import { ChatInteractionResponse, ComponentContext, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import { RankingSettingsHandlers } from '.'
import { GuildRanking } from '@repo/db/models'
import { Ranking } from '@repo/db/models'
import { App } from '../../../../setup/app'
import * as handlers from './handlers'

export const ranking_settings_view_sig = new ViewSignature({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    ranking_id: field.Int(),
    handler: field.Choice(handlers),
  },
  guild_only: true,
})

export const ranking_settings_view = ranking_settings_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    return ctx.state.get.handler()(app, ctx)
  },
})
export const settingsOptions: (gr: { guild_ranking: GuildRanking; ranking: Ranking }) => {
  [key: string]: {
    label: string
    description: string
    handler: (app: App, ctx: ComponentContext<typeof ranking_settings_view_sig>) => Promise<ChatInteractionResponse>
  }
} = gr => ({
  rename: {
    label: 'Rename',
    description: 'Rename the ranking',
    handler: RankingSettingsHandlers.renameModal,
  },
  leaderboard: {
    label: gr.guild_ranking.data.display_settings?.leaderboard_message
      ? `Disable Live Leaderboard`
      : `Enable Live Leaderboard`,
    description: gr.guild_ranking.data.display_settings?.leaderboard_message
      ? `Stop maintaining the live leaderboard message`
      : `Send the leaderboard message, and update it live`,
    handler: RankingSettingsHandlers.onToggleLiveLeaderboard,
  },
  challenge: {
    label: gr.ranking.data.matchmaking_settings?.direct_challenge_enabled
      ? `Disable Direct Challenges`
      : `Enable Direct Challenges`,
    description: gr.ranking.data.matchmaking_settings?.direct_challenge_enabled
      ? `Don't allow players to use /1v1 in this ranking`
      : `Allow players to use /1v1 in this ranking`,
    handler: RankingSettingsHandlers.onToggleChallenge,
  },
  queue: {
    label: `Matchmaking Queue`,
    description: `Customize the matchmaking queue`,
    handler: RankingSettingsHandlers.sendQueueSettingsPage,
  },
  scoring: {
    label: 'Rating Method',
    description: `Customize how players' ratings are calculated`,
    handler: RankingSettingsHandlers.sendScoringMethodSelectMenu,
  },
  delete: {
    label: 'Delete',
    description: 'Delete the ranking',
    handler: RankingSettingsHandlers.deletePage,
  },
})
