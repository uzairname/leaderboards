import { Router } from 'itty-router'
import { App } from '../../app/App'

export default (app: App) =>
  Router({ base: `/dashboard` })
    .get(`/`, () => new Response('Dashboard'))

    .get(`/ranking/:ranking_id`, async request => {
      const ranking_id = parseInt(request.params.ranking_id)
      const ranking = ranking_id ? await app.db.rankings.fetch(ranking_id) : null
      if (!ranking) {
        return new Response('Unknown ranking', { status: 404 })
      }

      // return html page
      const html = `
          <html>
            <body>
              <h1>${ranking.data.name} Match Config:</h1>
              <p>${JSON.stringify(ranking.data.match_config, null, 2)}</p>
            </body>
          </html>
        `

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
        },
      })
    })

    .all(`*`, () => new Response('Not Found', { status: 404 }))
