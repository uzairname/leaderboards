import { Context, DeferredContext } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { RatingStrategy } from '../../../../../../../packages/db/src/models/rankings'
import { challenge_cmd, join_cmd, leaderboard_cmd } from '../../../../setup/all-interaction-handlers'
import { App } from '../../../../setup/app'
import { Colors, commandMention, dateTimestamp, escapeMd } from '../../../../utils'
import { syncMatchesChannel } from '../../../matches/logging/matches-channel'
import { default_matchmaking_settings, liveLbMsgLink, rating_strategy_desc } from '../../properties'
import { RankingSettingsHandlers } from './handlers'
import { ranking_settings_view_sig, settingsOptions } from './view'

export namespace RankingSettingsPages {
  /**
   * Edits the page to the main ranking settings page
   * Must be from a deferred context
   */
  export async function main(app: App, ctx: DeferredContext<typeof ranking_settings_view_sig>): Promise<void> {
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

    const rating_strategy_desc = {
      [RatingStrategy.WinsMinusLosses]: `Wins - Losses`,
      [RatingStrategy.TrueSkill]: `TrueSkill2`,
      [RatingStrategy.Elo]: `Elo`,
    }[ranking.data.rating_settings.rating_strategy]

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
        value: `- Match type: **` + new Array(teams_per_match).fill(players_per_team).join('v') + `**\n` +
          `- Matchmaking queue (${await commandMention(app, join_cmd, guild_ranking.data.guild_id)} \`${ranking.data.name}\`): ` +
          (ranking.data.matchmaking_settings.queue_enabled ? `**Enabled**` : `**Disabled**`) + `\n` +
          `- Direct challenges (${await commandMention(app, challenge_cmd, guild_ranking.data.guild_id)} ... \`${ranking.data.name}\`): ` +
          (ranking.data.matchmaking_settings.direct_challenge_enabled ? `**Enabled**` : `**Disabled**`) + `\n` +
          `- By default, new matches are a best of **${ranking.data.matchmaking_settings.default_best_of ?? default_matchmaking_settings.default_best_of}**`,
      },
      {
        name: `Ratings`,
        value: `- Rating method: **${rating_strategy_desc}**`,
      },
    ]

    const embed: D.APIEmbed = {
      title: `Settings ➛ Rankings ➛ ${escapeMd(ranking.data.name)}`,
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
          custom_id: ctx.state.set.handler(RankingSettingsHandlers.onSettingSelect).cId(),
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
          custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
          emoji: {
            name: '⬅️',
          },
        },
      ],
    }

    const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [select_menu, buttons2]

    await ctx.edit({
      flags: D.MessageFlags.Ephemeral,
      embeds: [embed],
      components,
    })
  }

  /**
   * Queue settings page. Contains a button to enable/disable the queue.
   */
  export async function queue(
    app: App,
    ctx: Context<typeof ranking_settings_view_sig>,
  ): Promise<D.APIInteractionResponseCallbackData> {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())

    const queue_enabled = ranking.data.matchmaking_settings?.queue_enabled

    return {
      embeds: [
        {
          title: `Settings ➛ Rankings ➛ ${escapeMd(ranking.data.name)} ➛ Matchmaking Queue`,
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
              custom_id: ctx.state.set.handler(RankingSettingsHandlers.onToggleQueue).cId(),
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
              custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
              style: D.ButtonStyle.Secondary,
            },
          ],
        },
      ],
    }
  }

  /**
   *
   * Select menu to select a rating method.
   * Redirects to the ranking settings page's rating method select handler
   */
  export async function scoringMethod(
    app: App,
    ctx: Context<typeof ranking_settings_view_sig>,
  ): Promise<D.APIInteractionResponseCallbackData> {
    const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
    return {
      embeds: [
        {
          title: `Settings ➛ Rankings ➛ ${escapeMd(ranking.data.name)} ➛ Rating Method`,
          description: `# Rating Method
Choose how players' ratings in this ranking are updated as they play games.

Current: **${rating_strategy_desc[ranking.data.rating_settings.rating_strategy]}**`,
          color: Colors.EmbedBackground,
        },
      ],
      components: [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.StringSelect,
              custom_id: ctx.state.set.handler(RankingSettingsHandlers.onRatingMethodSelect).cId(),
              placeholder: 'Select a rating method',
              options: [
                {
                  label: 'Trueskill2',
                  value: RatingStrategy.TrueSkill.toString(),
                  description: `Microsoft's TrueSkill2 rating algorithm`,
                },
                {
                  label: 'Elo',
                  value: RatingStrategy.Elo.toString(),
                  description: `Standard Elo rating system used in Chess`,
                },
                {
                  label: 'Wins - Losses',
                  value: RatingStrategy.WinsMinusLosses.toString(),
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
              custom_id: ctx.state.set.handler(RankingSettingsHandlers.sendMainPage).cId(),
              emoji: {
                name: '⬅️',
              },
            },
          ],
        },
      ],
    }
  }
}
