import { maxIndex } from '@repo/utils'
import { PlayerStats } from 'packages/db/src/models/players'
import { AnsiColor, AnsiFormat, formatTable, TableRow } from '../../../services/utils/strings'

/**
 * Returns a code block containing a table that displays
 * the player's win loss ratio, etc.
 */
export function wlrTable({ stats }: { stats: PlayerStats }): string {
  const draws_enabled = false

  const winrate_percent = null !== stats.winrate ? `${(stats.winrate * 100).toFixed(1)}%` : `N/A`

  let cells: TableRow[] = [
    [{ text: `Wins` }, { text: `${stats.wins}`, color: AnsiColor.Lime, format: AnsiFormat.Bold }],
    [{ text: `Losses` }, { text: `${stats.losses}`, color: AnsiColor.Red, format: AnsiFormat.Bold }],
  ]

  if (draws_enabled) {
    cells.push([{ text: `Draws` }, { text: `${stats.draws}`, color: AnsiColor.Gold, format: AnsiFormat.Bold }])
  }

  cells.push([
    {
      text: `Winrate`,
    },
    {
      text: `${winrate_percent}`,
      color:
        null !== stats.winrate
          ? stats.winrate >= 1
            ? AnsiColor.Teal
            : stats.winrate >= 2 / 3
              ? AnsiColor.Lime
              : stats.winrate >= 1 / 3
                ? AnsiColor.Gold
                : AnsiColor.Red
          : AnsiColor.DarkGray,
      format: AnsiFormat.Bold,
    },
  ])

  return formatTable(...cells)
}

export function ratingTable({ stats }: { stats: PlayerStats }): string {
  const points = stats.display_rating.points + (stats.display_rating.is_provisional ? `?` : ``)

  const rd_text = stats.display_rating.rd ? ` ±${stats.display_rating.rd}` : ``

  const peak_rating_idx = maxIndex(stats.rating_history.map(r => r.points))[0]
  let peak_rating: string
  if (undefined === peak_rating_idx) {
    peak_rating = `N/A`
  } else {
    if (stats.rating_history[peak_rating_idx].is_provisional) {
      peak_rating = `${stats.rating_history[peak_rating_idx].points}?`
    } else {
      peak_rating = `${stats.rating_history[peak_rating_idx].points}`
    }
  }

  const avg_opponent_rating = null === stats.avg_opponent_rating ? `N/A` : `${stats.avg_opponent_rating.toFixed(0)}`

  return formatTable(
    [
      {
        text: `Rating`,
      },
      {
        text: points + rd_text,
        format: AnsiFormat.Bold,
      },
    ],
    [
      {
        text: `Peak Rating`,
      },
      peak_rating,
    ],
    [
      {
        text: `Avg Opponent Rating`,
      },
      avg_opponent_rating,
    ],
  )
}
