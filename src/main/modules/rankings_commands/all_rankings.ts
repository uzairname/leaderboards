import * as D from 'discord-api-types/v10'
import { GuildRanking } from '../../../database/models'
import { InteractionContext } from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import { unflatten, nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { escapeMd, Colors, messageLink, dateTimestamp } from '../../messages/message_pieces'
import { Messages } from '../../messages/messages'
import { checkGuildInteraction } from '../../views/utils/checks'
import { getOrAddGuild, getMatchLogsChannel } from '../guilds'
import { create_ranking_view_def, createRankingModal } from './create_ranking'
import { ranking_settings_page } from './ranking_settings'
import { rankings_cmd_def } from './rankings_cmd'

// Rankings command for any guild, with callbacks

export async function allGuildRankingsPage(
  app: App,
  ctx: InteractionContext<typeof rankings_cmd_def>,
): Promise<D.APIInteractionResponseCallbackData> {
  const interaction = checkGuildInteraction(ctx.interaction)
  const guild_rankings = await app.db.guild_rankings.get({ guild_id: interaction.guild_id })
  const guild = await getOrAddGuild(app, interaction.guild_id)

  let embeds: D.APIEmbed[] = [
    {
      description: `# ${escapeMd(guild.data.name)}'s Rankings`
        + `\n` + (guild_rankings.length === 0
          ? Messages.no_rankings_description
          : `You have **${guild_rankings.length}** ranking${guild_rankings.length === 1 ? `` : `s`}`
          + ` in this server`), //prettier-ignore
      fields: await Promise.all(
        guild_rankings.map(async item => {
          return {
            name: escapeMd(item.ranking.data.name),
            value: await guildRankingDetails(app, item.guild_ranking, { queue_teams: true }),
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
      custom_id: ranking_settings_page
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
            custom_id: create_ranking_view_def.newState({ callback: createRankingModal }).cId(),
            label: 'Ranking',
            emoji: {
              name: '➕',
            },
          },
        ],
      },
    ],
  }
}
export async function guildRankingDetails(
  app: App,
  guild_ranking: GuildRanking,
  details?: {
    queue_teams?: boolean
  },
): Promise<string> {
  const ranking = await guild_ranking.ranking
  const time_created = ranking.data.time_created

  const num_teams = nonNullable(ranking.data.num_teams, 'num_teams')
  const players_per_team = nonNullable(ranking.data.players_per_team, 'players_per_team')
  const match_logs_channel_id = guild_ranking.data.display_settings?.log_matches
    ? (await getMatchLogsChannel(app, guild_ranking.data.guild_id))?.id
    : undefined

  return (
    `- Match type: **` + new Array(num_teams).fill(players_per_team).join('v') + `**`
    + `\n- ` + (guild_ranking.data.leaderboard_message_id
      ? messageLink(
        guild_ranking.data.guild_id,
        guild_ranking.data.leaderboard_channel_id || '0',
        guild_ranking.data.leaderboard_message_id
      )
      : `Leaderboard not displayed anywhere`)
    + (time_created
      ? `\n- Created on ${dateTimestamp(time_created)}`
      : ``)
    + (details?.queue_teams
      ? `\n- Current ${players_per_team > 1 ? 'Teams' : 'Players'} in queue: ${await (async () => {
        const queue_teams = await ranking.queueTeams()
        return Object.keys(queue_teams).length
      })()}`
      : ``)
    + (match_logs_channel_id
      ? `\n- Matches are logged in <#${match_logs_channel_id}>`
      : ``)
    // prettier-ignore
  )
}
