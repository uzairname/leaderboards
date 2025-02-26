import { GuildRanking, Ranking, ScoringMethod } from '@repo/db/models'
import { ChatInteractionResponse, ComponentContext, Context, DeferredContext, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { challenge_cmd, join_cmd, leaderboard_cmd } from '../../../../setup/all-interaction-handlers'
import { Colors, commandMention, dateTimestamp, escapeMd } from '../../../../utils/ui'
import { syncMatchesChannel } from '../../../matches/logging/matches-channel'
import { default_matchmaking_settings, liveLbMsgLink, scoring_method_desc } from '../../properties'
import * as handlers from './ranking-settings-handlers'
import { onScoringMethodSelect, sendRankingSettingsPage } from './ranking-settings-handlers'

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
    if (ctx.state.data.handler) {
      return ctx.state.data.handler(app, ctx)
    } else {
      return handlers.sendRankingSettingsPage(app, ctx)
    }
  },
})

/**
 * The main ranking settings page
 */
export async function rankingSettingsPage(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild, guild_ranking, ranking } = await app.db.guild_rankings.fetchBy({
    guild_id: ctx.interaction.guild_id,
    ranking_id: ctx.state.get.ranking_id(),
  })

  const time_created = ranking.data.time_created
  const teams_per_match = ranking.data.teams_per_match
  const players_per_team = ranking.data.players_per_team

  // Get the match logs channel if it's enabled
  const match_logs_channel_id = guild_ranking.data.display_settings?.log_matches
    ? (await syncMatchesChannel(app, guild_ranking.guild))?.id
    : undefined

  const scoring_method_desc = {
    [ScoringMethod.WinsMinusLosses]: `Wins - Losses`,
    [ScoringMethod.TrueSkill]: `TrueSkill2`,
    [ScoringMethod.Elo]: `Elo`,
  }[ranking.data.rating_settings.scoring_method]

  const lb_msg_link = await liveLbMsgLink(app, guild_ranking)

  const description =
    `# ${escapeMd(ranking.data.name)}\n` +
    (lb_msg_link
      ? `Live leaderboard: ${lb_msg_link}`
      : `View the leaderboard with ${await commandMention(app, leaderboard_cmd, guild.data.id)}`) +
    (time_created ? `\nCreated on ${dateTimestamp(time_created)}` : ``) +
    (match_logs_channel_id ? `\nMatches are logged in <#${match_logs_channel_id}>` : ``)

  const fields: D.APIEmbedField[] = [
    {
      name: `Matchmaking`,
      //prettier-ignore
      value:
        `- Match type: **` + new Array(teams_per_match).fill(players_per_team).join('v') + `**\n` +
        `- Matchmaking queue (${await commandMention(app, join_cmd, guild_ranking.data.guild_id)} \`${ranking.data.name}\`): ` + 
          (ranking.data.matchmaking_settings.queue_enabled ? `**Enabled**` : `**Disabled**`) + `\n` +
        `- Direct challenges (${await commandMention(app, challenge_cmd, guild_ranking.data.guild_id)} ... \`${ranking.data.name}\`): ` +
          (ranking.data.matchmaking_settings.direct_challenge_enabled ? `**Enabled**` : `**Disabled**`) + `\n` +
        `- By default, new matches are a best of **${ranking.data.matchmaking_settings.default_best_of ?? default_matchmaking_settings.default_best_of}**`,
    },
    {
      name: `Ratings`,
      value: `- Scoring method: **${scoring_method_desc}**`,
    },
  ]

  const embed: D.APIEmbed = {
    title: `Settings → Rankings → ${escapeMd(ranking.data.name)}`,
    description,
    fields,
    color: Colors.EmbedBackground,
  }

  if (app.config.features.WebDashboardEnabled) {
    throw new Error('Not implemented')
  }

  const select_menu: D.APIActionRowComponent<D.APIMessageActionRowComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.StringSelect,
        custom_id: ctx.state.set.handler(handlers.onSettingSelect).cId(),
        options: Object.entries(settingsOptions({ guild_ranking, ranking })).map(([key, option]) => ({
          ...option,
          value: key,
        })),
        min_values: 0,
      },
    ],
  }

  const buttons2: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `Back`,
        style: D.ButtonStyle.Secondary,
        custom_id: ctx.state.set.handler(handlers.sendAllRankingsPage).cId(),
        emoji: {
          name: '⬅️',
        },
      },
    ],
  }

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [select_menu, buttons2]

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds: [embed],
    components,
  }
}

export const settingsOptions: (gr: { guild_ranking: GuildRanking; ranking: Ranking }) => {
  [key: string]: {
    label: string
    description: string
    callback: (app: App, ctx: ComponentContext<typeof ranking_settings_view_sig>) => Promise<ChatInteractionResponse>
  }
} = gr => ({
  rename: {
    label: 'Rename',
    description: 'Rename the ranking',
    callback: handlers.sendRenameModal,
  },
  leaderboard: {
    label: gr.guild_ranking.data.display_settings?.leaderboard_message
      ? `Disable Live Leaderboard`
      : `Enable Live Leaderboard`,
    description: gr.guild_ranking.data.display_settings?.leaderboard_message
      ? `Stop maintaining the live leaderboard message`
      : `Send the leaderboard message, and update it live`,
    callback: handlers.onToggleLiveLeaderboard,
  },
  challenge: {
    label: gr.ranking.data.matchmaking_settings?.direct_challenge_enabled
      ? `Disable Direct Challenges`
      : `Enable Direct Challenges`,
    description: gr.ranking.data.matchmaking_settings?.direct_challenge_enabled
      ? `Don't allow players to use /1v1 in this ranking`
      : `Allow players to use /1v1 in this ranking`,
    callback: handlers.onToggleChallenge,
  },
  queue: {
    label: `Matchmaking Queue`,
    description: `Customize the matchmaking queue`,
    callback: handlers.sendQueueSettingsPage,
  },
  scoring: {
    label: 'Rating Method',
    description: `Customize how players' ratings are calculated`,
    callback: handlers.sendScoringMethodSelectMenu,
  },
  delete: {
    label: 'Delete',
    description: 'Delete the ranking',
    callback: handlers.deletePage,
  },
})

/**
 * Queue settings page. Contains a button to enable/disable the queue.
 */
export async function queueSettingsPage(
  app: App,
  ctx: DeferredContext<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

  const queue_enabled = ranking.data.matchmaking_settings?.queue_enabled

  return {
    embeds: [
      {
        title: `Settings ► Rankings ► ${escapeMd(ranking.data.name)} ► Matchmaking Queue`,
        description: `# Matchmaking Queue
If enabled, players can join the matchmaking queue by using ${await commandMention(app, join_cmd, ctx.interaction.guild_id)} \`${ranking.data.name}\` to start games ranking.

The queue is currently **${queue_enabled ? `enabled` : `disabled`}.**`,
        color: Colors.EmbedBackground,
      },
    ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: `${queue_enabled ? `Disable` : `Enable`} the queue`,
            custom_id: ctx.state.set.handler(handlers.onToggleQueue).cId(),
            style: queue_enabled ? D.ButtonStyle.Danger : D.ButtonStyle.Success,
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: `Back`,
            custom_id: ctx.state.set.handler(handlers.sendRankingSettingsPage).cId(),
            style: D.ButtonStyle.Secondary,
          },
        ],
      },
    ],
  }
}

/**
 * Select menu to select a scoring method.
 * Redirects to the ranking settings page's scoring method select handler
 */
export async function scoringMethodSelectMenu(
  app: App,
  ctx: Context<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  return {
    embeds: [
      {
        title: `Settings → Rankings → ${escapeMd(ranking.data.name)} → Scoring Method`,
        description: `# Scoring Method
Choose how players' ratings in this ranking are updated as they play games.

Current: **${scoring_method_desc[ranking.data.rating_settings.scoring_method]}**`,
        color: Colors.EmbedBackground,
      },
    ],
    components: [
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.StringSelect,
            custom_id: ctx.state.set.handler(onScoringMethodSelect).cId(),
            placeholder: 'Select a scoring method',
            options: [
              {
                label: 'Trueskill2',
                value: ScoringMethod.TrueSkill.toString(),
                description: `Microsoft's TrueSkill2 ranking algorithm`,
              },
              {
                label: 'Elo',
                value: ScoringMethod.Elo.toString(),
                description: `Standard Elo rating system used in Chess`,
              },
              {
                label: 'Wins - Losses',
                value: ScoringMethod.WinsMinusLosses.toString(),
                description: `1 point for a win, lose a point for a loss`,
              },
            ],
          },
        ],
      },
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            label: `Back`,
            style: D.ButtonStyle.Secondary,
            custom_id: ctx.state.set.handler(sendRankingSettingsPage).cId(),
            emoji: {
              name: '⬅️',
            },
          },
        ],
      },
    ],
  }
}
