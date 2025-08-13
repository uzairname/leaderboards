import { EmbedBuilder } from '@discordjs/builders'
import { Ranking } from '@repo/db/models'
import { Context } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { type App } from '../../../setup/app'
import { commandMention, escapeMd, relativeTimestamp, space } from '../../../utils/ui'
import { numRankings } from '../../guilds/properties'
import { mentionOrName, orderedLeaderboardPlayers } from '../../players/properties'
import { getApplicableRankRoles } from '../../players/rank-roles'
import { DEFAULT_LB_COLOR, rankingProperties } from '../../settings/properties'
import { leaderboard_cmd } from './cmd'
import { leaderboard_view_sig } from './view'

/**
 * Returns the embeds and max page for the leaderboard
 */
export async function leaderboardMessage(
  app: App,
  ranking: Ranking,
  options?: {
    guild_id?: string
    show_lb_cmd_tip?: boolean
    show_provisional?: boolean
    page?: number
  },
): Promise<{ embeds: D.APIEmbed[]; max_page: number }> {
  const lines_per_page = 25
  const page = options?.page ?? 1

  const players = await orderedLeaderboardPlayers(app, ranking)

  const { guild, guild_ranking } = options?.guild_id
    ? await app.db.guild_rankings.fetch({ guild_id: options.guild_id, ranking_id: ranking.data.id })
    : {}

  // Determine the rank role for each player to feature
  if (guild_ranking) {
    var featured_rank_roles = await Promise.all(
      players.map(async player => {
        const rank_roles = await getApplicableRankRoles(app, player.player, guild_ranking)
        const roles = Object.entries(rank_roles)
          .filter(([_, has_role]) => has_role)
          .map(([role_id, _]) => role_id)
        return roles[roles.length - 1] ?? null
      }),
    )
  } else {
    featured_rank_roles = []
  }

  let place = 0
  const max_rating_len = players[0]?.points.toFixed(0).length ?? 0

  // List of strings for each player on the leaderboard
  const players_lines = players
    .map(p => {
      const rating_text = `\`${p.points.toFixed(0)}\``.padStart(max_rating_len + 2 - `${place}`.length)
      if (p.is_provisional) {
        return null
      } else {
        place++
        return (
          `### \`${place}.`.padEnd(3, ' ') +
          `\`` +
          `${space}${rating_text}` +
          `${space}${mentionOrName(p.player)}` +
          (featured_rank_roles[place - 1] ? ` (<@&${featured_rank_roles[place - 1]}>)` : ``) // Add the rank role mention if it exists
        )
      }
    })
    .filter(Boolean) as string[]

  // Add provisional players at the end, if specified
  const provisional_players_lines = options?.show_provisional
    ? players
        .filter(p => p.is_provisional)
        .map(p => {
          return `### -# ${space + space}\`${p.points.toFixed(0)}?\`${space}${mentionOrName(p.player)} `
        })
    : []

  // Combine to get all lines
  let all_lines = players_lines.concat(provisional_players_lines)
  const max_page = Math.ceil(all_lines.length / lines_per_page)

  // Determine the lines to show on the current page
  const current_page_lines = all_lines.slice((page - 1) * lines_per_page, page * lines_per_page)
  if (current_page_lines.length == 0) {
    current_page_lines.push(`No players to show.`)
  }

  // Add bottom text
  const fits_on_one_page = max_page <= 1

  const color = guild_ranking?.data.display_settings?.color ?? DEFAULT_LB_COLOR

  const bottom_text =
    `-# Last updated ${relativeTimestamp(new Date(Date.now()))}. ` +
    (rankingProperties(ranking).uses_provisional_ratings
      ? `\n-# Unranked players are given a provisional rating and are hidden from the main leaderboard until they play more games.`
      : ``) +
    (fits_on_one_page ? `` : `\n-# Page ${page} of ${Math.ceil(all_lines.length / lines_per_page)}.`) +
    (options?.show_lb_cmd_tip && !fits_on_one_page
      ? `\nUse ${await commandMention(app, leaderboard_cmd, options?.guild_id)}${guild && (await numRankings(app, guild)) > 1 ? ` \`${ranking.data.name}\`` : ``} to see the full leaderboard.`
      : ``)

  // const embed: D.APIEmbed = {
  //   title: `${escapeMd(ranking.data.name)} Leaderboard`,
  //   description: current_page_lines.join('\n') + '\n' + bottom_text,
  //   color: Colors.Primary,
  // }

  const embed = new EmbedBuilder()
    .setTitle(`${escapeMd(ranking.data.name)} Leaderboard`)
    .setDescription(current_page_lines.join('\n') + '\n' + bottom_text)
    .setColor(color)

  const embeds = [embed.toJSON()]

  return {
    embeds,
    max_page,
  }
}

export async function leaderboardPage(
  app: App,
  ctx: Context<typeof leaderboard_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  const page = ctx.state.get.page()

  const { embeds, max_page } = await leaderboardMessage(app, ranking, {
    guild_id: ctx.interaction.guild_id,
    show_provisional: true,
    page,
  })

  ctx.state.save.max_page(max_page)

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '⏮️' },
          custom_id: ctx.state.set.clicked_nav_btn('start').cId(),
          disabled: page == 1,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '◀️' },
          custom_id: ctx.state.set.clicked_nav_btn('prev').cId(),
          disabled: page == 1,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '▶️' },
          custom_id: ctx.state.set.clicked_nav_btn('next').cId(),
          disabled: page == max_page,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '⏭️' },
          custom_id: ctx.state.set.clicked_nav_btn('end').cId(),
          disabled: page == max_page,
        },
      ],
    },
  ]

  return {
    embeds,
    components,
  }
}
