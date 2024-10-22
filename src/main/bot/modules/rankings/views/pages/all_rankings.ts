import * as D from 'discord-api-types/v10'
import { sentry } from '../../../../../../logging'
import { nonNullable, unflatten } from '../../../../../../utils/utils'
import { App } from '../../../../../context/app_context'
import { Guild, GuildRanking } from '../../../../../database/models'
import { Colors } from '../../../../common/constants'
import { AppMessages } from '../../../../common/messages'
import { dateTimestamp, escapeMd, messageLink } from '../../../../common/strings'
import { getMatchLogsChannel } from '../../../guilds'
import { create_ranking_view, createRankingModal } from './create_ranking'
import { ranking_settings_view } from './ranking_settings'

// Rankings command for any guild, with callbacks

export async function allGuildRankingsPage(
  app: App,
  guild: Guild,
): Promise<D.APIInteractionResponseCallbackData> {
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: guild.data.id })

  const embeds: D.APIEmbed[] = [
    {
      title: `${escapeMd(guild.data.name)}'s Rankings`,
      description: (guild_rankings.length === 0
        ? AppMessages.no_rankings_description
        : `You have **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}`
        + ` in this server`), //prettier-ignore
      fields: await Promise.all(
        guild_rankings.map(async item => {
          return {
            name: escapeMd(item.ranking.data.name),
            value: await guildRankingDetails(app, item.guild_ranking),
            inline: false,
          }
        }),
      ),
      color: Colors.Primary,
    },
  ]

  const ranking_btns: D.APIButtonComponent[] = guild_rankings.map(item => {
    return {
      type: D.ComponentType.Button,
      label: item.ranking.data.name || 'Unnamed Ranking',
      style: D.ButtonStyle.Primary,
      custom_id: ranking_settings_view
        .newState({
          ranking_id: item.ranking.data.id,
          guild_id: item.guild_ranking.data.guild_id,
        })
        .cId(),
    }
  })

  const btn_action_rows: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = unflatten(
    ranking_btns,
    5,
    false,
  ).map(btns => {
    sentry.debug(`btns ${JSON.stringify(btns)}`)
    return {
      type: D.ComponentType.ActionRow,
      components: btns,
    }
  })

  return {
    flags: D.MessageFlags.Ephemeral,
    content: '',
    embeds,
    components: [
      ...btn_action_rows.slice(0, 4),
      {
        type: D.ComponentType.ActionRow,
        components: [
          {
            type: D.ComponentType.Button,
            style: D.ButtonStyle.Success,
            custom_id: create_ranking_view.newState({ callback: createRankingModal }).cId(),
            label: 'New Ranking',
            emoji: {
              name: '➕',
            },
          },
        ],
      },
    ],
  }
}

export async function guildRankingDetails(app: App, guild_ranking: GuildRanking): Promise<string> {
  sentry.debug(`guildRankingDetails guild_ranking ${JSON.stringify(guild_ranking.data)}`)

  guild_ranking = await app.db.guild_rankings.get({
    guild_id: guild_ranking.data.guild_id,
    ranking_id: guild_ranking.data.ranking_id,
  })

  const ranking = await guild_ranking.ranking
  const time_created = ranking.data.time_created

  const num_teams = nonNullable(ranking.data.num_teams, 'num_teams')
  const players_per_team = nonNullable(ranking.data.players_per_team, 'players_per_team')
  const match_logs_channel_id = guild_ranking.data.display_settings?.log_matches
    ? (await getMatchLogsChannel(app, await guild_ranking.guild))?.id
    : undefined

  return (
    `- Match type: **` + new Array(num_teams).fill(players_per_team).join('v') + `**`
    + `\n- ` + (guild_ranking.data.leaderboard_message_id
      ? `Live leaderboard: ${messageLink(
        guild_ranking.data.guild_id,
        guild_ranking.data.leaderboard_channel_id || '0',
        guild_ranking.data.leaderboard_message_id
      )}`
      : `Leaderboard not displayed anywhere`)
    + (time_created
      ? `\n- Created on ${dateTimestamp(time_created)}`
      : ``)
    + (match_logs_channel_id
      ? `\n- Matches are logged in <#${match_logs_channel_id}>`
      : ``)
    // prettier-ignore
  )
}
