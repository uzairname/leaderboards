import { Router, json } from 'itty-router'
import { sentry } from '../../request/sentry'
import { maxIndex, nonNullable } from '../../utils/utils'
import { App } from '../app/app'
import { Colors, relativeTimestamp } from '../messages/message_pieces'
import { calculateMatchNewRatings } from '../modules/matches/scoring/score_matches'
import { getRegisterPlayer } from '../modules/players'
import { default_elo_settings } from '../modules/rankings/manage_rankings'
import { leaderboardMessage } from '../modules/rankings/ranking_channels'

export const apiRouter = (app: App) =>
  Router({ base: '/api' })
    .get('/', async () => {
      const result = await main(app)
      return result
    })
    .get('/matches', async request => {
      const player_ids = (request.query['player_ids'] as string)?.split(',').map(Number)
      const result = await matches(app, player_ids)
      return result
    })
    .all('*', () => new Response('Not found', { status: 404 }))

async function main(app: App) {
  const ranking = app.db.rankings.partial(17)

  let player = await getRegisterPlayer(app, '1108557678013325385', ranking)

  const rankingplayers = await ranking.getOrderedTopPlayers()
  sentry.debug(`rankingplayers ${rankingplayers.length}`)
  return (await leaderboardMessage(ranking)).patchdata.embeds![0].description
}

async function matches(app: App, player_ids: number[] = [33, 40]) {
  // const matches = await Promise.all(
  //   (
  //     await app.db.matches.get({
  //       player_ids: [35],
  //       ranking_ids: [17, 26],
  //       limit: 10,
  //     })
  //   ).map(async (item) => {
  //     try {
  //       // await app.bot.getChannel('1183169465232392202')
  //     } catch {}

  //     await item.match.ranking()
  //     return {
  //       match: item.match,
  //     }
  //   }),
  // )

  const matches = await Promise.all(
    (
      await app.db.matches.get({
        player_ids: [35],
        ranking_ids: [17, 26],
        limit_matches: 10,
      })
    ).map(async (item, idx) => {
      // await app.bot.getChannel('1183169465232392202')

      return {
        match: item.match,
        team_players: item.teams,
        new_ratings: calculateMatchNewRatings(
          item.match,
          item.teams.map(t =>
            t.map(p => {
              return {
                id: nonNullable(p.player.data.id, 'player id'),
                rating: nonNullable(p.match_player.rating_before, 'rating before'),
                rd: nonNullable(p.match_player.rd_before, 'rd before'),
              }
            }),
          ),
          (await item.match.ranking()).data.elo_settings ?? default_elo_settings,
        ),
        winning_team_num: maxIndex(item.match.data.outcome ?? []),
        ranking: await item.match.ranking(),
      }
    }),
  )

  return new Response(
    JSON.stringify({
      embeds:
        matches.length > 0
          ? matches.map(match => {
              return {
                title: `#${match.match.data.number}`,
                fields: [
                  match.team_players.map((team, team_num) => {
                    return {
                      name:
                        (team_num === match.winning_team_num ? '⭐ ' : '') +
                          match.match.data.outcome?.[team_num] ?? '',
                      value: team
                        .map((player, player_num) => {
                          const rating_after_text =
                            match.new_ratings[team_num][player_num].rating_after.toFixed(0)
                          const diff =
                            match.new_ratings[team_num][player_num].rating_after -
                            nonNullable(player.match_player.rating_before)
                          const diff_text = (diff > 0 ? '+' : '') + diff.toFixed(0)
                          return `<@${player.player.data.user_id}> ${rating_after_text} (*${diff_text}*)`
                        })
                        .join('\n'),
                      inline: true,
                    }
                  }),
                  {
                    name: `Details`,
                    value: `Finished ${
                      match.match.data.time_finished
                        ? relativeTimestamp(match.match.data.time_finished)
                        : 'unknown'
                    }`,
                  },
                ].flat(),
                color: Colors.EmbedBackground,
              }
            })
          : [
              {
                title: `No matches`,
                color: Colors.EmbedBackground,
              },
            ],
    }),
    {
      headers: {
        'content-type': 'application/json',
      },
    },
  )
}
