import { EmbedBuilder } from '@discordjs/builders'
import { Ranking } from '@repo/db/models'
import { Context, MessageData } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { calculateRankRolesForRating } from '../../services/players/rank-roles'
import { DEFAULT_LB_COLOR } from '../../services/rankings/properties'
import { commandMention, escapeMd, relativeTimestamp, space } from '../../services/utils/strings'
import { App } from '../../setup/app'
import { leaderboard_cmd } from './cmd'
import { leaderboard_view_sig } from './view'

/**
 * @returns
 * - text: The leaderboard text
 * - max_page: The total number of pages
 */
export async function leaderboardText(
  app: App,
  ranking: Ranking,
  options?: {
    guild_id?: string
    show_lb_cmd_tip?: boolean
    show_provisional?: boolean
    page_idx?: number
  },
): Promise<{
  text: string
  max_page: number
}> {
  const lines_per_page = 25
  const page_idx = options?.page_idx ?? 0

  const players = await app.lbs.getOrderedPlayers(app, ranking)

  const { guild, guild_ranking } = options?.guild_id
    ? await app.db.guild_rankings.fetch({ guild_id: options.guild_id, ranking_id: ranking.data.id })
    : {}

  let place = 0
  const max_rating_len = players[0]?.points.toFixed(0).length ?? 0

  // List of strings for each player on the leaderboard
  const players_lines = players
    .map(p => {
      if (p.is_provisional) {
        if (options?.show_provisional) {
          return (
            `> ${space}` +
            `\`` +
            `${p.points.toFixed(0)}`.padStart(max_rating_len) +
            `\`` +
            `${space}${app.players.mentionOrName(p.player)} ` +
            `*Unranked*`
          )
        }
        return null
      } else {
        place++

        let rank_role_id: string | undefined = undefined

        if (guild_ranking) {
          const rank_roles = calculateRankRolesForRating(app, guild_ranking, p)
          if (rank_roles.length > 0) {
            rank_role_id = rank_roles[rank_roles.length - 1] // Get the last role in the list, which is the highest rank
          }
        }

        return (
          `\`` +
          `${place}.`.padEnd(3, ' ') +
          `\`  **\`${p.points.toFixed(0).padStart(max_rating_len)}\`**` +
          `${space}${app.players.mentionOrName(p.player)}` +
          // `` +
          (rank_role_id ? ` (<@&${rank_role_id}>)` : ``) // Add the rank role mention if it exists
        )
      }
    })
    .filter(Boolean) as string[]

  // Combine to get all lines
  // let all_lines = players_lines.concat(provisional_players_lines)
  const all_lines = players_lines
  const max_page = Math.ceil(all_lines.length / lines_per_page) - 1

  // Determine the lines to show on the current page
  const current_page_lines = all_lines.slice(page_idx * lines_per_page, (page_idx + 1) * lines_per_page)

  if (current_page_lines.length == 0) {
    current_page_lines.push(`No players to show.`)
  }

  // Add bottom text
  const fits_on_one_page = max_page <= 0

  const bottom_text =
    `-# Last updated ${relativeTimestamp(new Date())}. ` +
    (app.rankings.getProperties(ranking).uses_provisional_ratings
      ? `\n-# Unranked players are given a provisional rating and are hidden from the main leaderboard until they play more games.`
      : ``) +
    (fits_on_one_page ? `` : `\n-# Page ${page_idx + 1} of ${max_page + 1}.`) +
    (options?.show_lb_cmd_tip && guild
      ? `\nUse ${await commandMention(app, leaderboard_cmd, options?.guild_id)} \`${ranking.data.name}\` to see the full leaderboard.`
      : ``)

  return {
    text: current_page_lines.join('\n') + '\n' + bottom_text,
    max_page,
  }
}

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
    page_idx?: number
  },
): Promise<{ message: MessageData; max_page: number }> {
  const { guild_ranking } = options?.guild_id
    ? await app.db.guild_rankings.fetch({ guild_id: options.guild_id, ranking_id: ranking.data.id })
    : {}

  const color = guild_ranking?.data.display_settings?.color ?? DEFAULT_LB_COLOR

  const { text, max_page } = await leaderboardText(app, ranking, options)

  const embed = new EmbedBuilder()
    .setTitle(`${escapeMd(ranking.data.name)} Leaderboard`)
    .setDescription(text)
    .setColor(color)

  const message = new MessageData({
    embeds: [embed.toJSON()],
  })

  return {
    message,
    max_page,
  }
}

/**
 * A leaderboard message with pagination components
 */
export async function leaderboardPage(
  app: App,
  ctx: Context<typeof leaderboard_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const ranking = await app.db.rankings.fetch(ctx.state.get.ranking_id())
  const page_idx = ctx.state.data.page_idx ?? 0

  const { message, max_page } = await leaderboardMessage(app, ranking, {
    guild_id: ctx.interaction.guild_id,
    show_provisional: true,
    page_idx,
  })

  const components: D.APIActionRowComponent<D.APIComponentInMessageActionRow>[] = [
    {
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '⏮️' },
          custom_id: ctx.state.set.page_idx(0).set.id(1).cId(),
          disabled: page_idx == 0,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '◀️' },
          custom_id: ctx.state.set
            .page_idx(page_idx - 1)
            .set.id(0)
            .cId(),
          disabled: page_idx == 0,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '▶️' },
          custom_id: ctx.state.set
            .page_idx(page_idx + 1)
            .set.id(0)
            .cId(),
          disabled: page_idx == max_page,
        },
        {
          type: D.ComponentType.Button,
          style: D.ButtonStyle.Primary,
          emoji: { name: '⏭️' },
          custom_id: ctx.state.set.page_idx(max_page).set.id(1).cId(),
          disabled: page_idx == max_page,
        },
      ],
    },
  ]

  message.body.components = components

  return message.response_data
}
