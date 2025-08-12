import { maxIndex } from '@repo/utils'
import { AnsiColor, AnsiFormat, formatTable, TableRow } from '../../../../utils/ui/strings'
import { PlayerStats } from '../../properties'

/**
 * Returns a code block containing a table that displays
 * the player's win loss ratio, etc.
 */
export function wlrTable({ stats }: { stats: PlayerStats }): string {
  const draws_enabled = false

  const winrate_percent = null !== stats.winrate ? `${(stats.winrate * 100).toFixed(1)}%` : `N/A`

  let keys: TableRow = [{ text: `Wins` }, { text: `Losses` }]

  keys = keys.concat(draws_enabled ? [`Draws`] : []).concat([`Winrate`])

  let values: TableRow = [
    { text: `${stats.wins}`, color: AnsiColor.Lime, format: AnsiFormat.Bold },
    { text: `${stats.losses}`, color: AnsiColor.Red, format: AnsiFormat.Bold },
  ]

  values = values.concat(draws_enabled ? [`${stats.draws}`] : []).concat([
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

  return formatTable(keys, values)
}

export function ratingTable({ stats }: { stats: PlayerStats }): string {
  const points = stats.display_rating.points + (stats.display_rating.is_provisional ? `?` : ``)

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

  return formatTable(
    [`Rating`, `Peak Rating`],
    [
      {
        text: points,
        format: stats.display_rating.is_provisional ? undefined : AnsiFormat.Bold,
      },
      peak_rating,
    ],
  )
}
