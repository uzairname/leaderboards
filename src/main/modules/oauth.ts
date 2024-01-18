import * as D from 'discord-api-types/v10'
import { Router } from 'itty-router'
import { AccessToken } from '../../database/models/models/access_tokens'
import { AccessTokens } from '../../database/schema'
import { DiscordAPIClient } from '../../discord-framework'
import { sentry } from '../../request/sentry'
import { nonNullable } from '../../utils/utils'
import { App } from '../app/app'
import { AppErrors } from '../app/errors'

export const oauthRouter = (app: App) =>
  Router({ base: `/oauth` })
    .get(app.config.OauthRoutes.Redirect, request => oauthCallback(app, request))

    .get(app.config.OauthRoutes.LinkedRoles, () =>
      oauthRedirect(app, [D.OAuth2Scopes.Identify, D.OAuth2Scopes.RoleConnectionsWrite]),
    )

    .get(app.config.OauthRoutes.BotAndRoleConnections, () =>
      oauthRedirect(
        app,
        [D.OAuth2Scopes.Identify, D.OAuth2Scopes.Bot, D.OAuth2Scopes.RoleConnectionsWrite],
        app.config.RequiredBotPermissions,
      ),
    )

    .get(`*`, () => new Response('Unknown oauth route', { status: 404 }))

export function oauthRedirect(
  app: App,
  scopes: D.OAuth2Scopes[],
  bot_permissions?: bigint,
): Response {
  const state = crypto.randomUUID()

  const url = app.bot.oauthURL(app.config.OauthRedirectURI, scopes, state, bot_permissions)

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': `state=${state}; HttpOnly; Secure; Max-Age=300; path=/;`,
    },
  })
}

export async function oauthCallback(app: App, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const client_state = request.headers.get('Cookie')?.split('state=')[1]?.split(';')[0]
  const discord_state = url.searchParams.get('state')

  if (client_state !== discord_state) {
    return new Response('Invalid state', { status: 403 })
  }

  try {
    await saveUserAccessToken(
      app,
      await app.bot.getOauthToken(
        nonNullable(url.searchParams.get('code'), 'code'),
        app.config.OauthRedirectURI,
      ),
    )
  } catch (e) {
    sentry.setException(e)
    return new Response('Invalid code', { status: 400 })
  }

  return new Response(`Authorized. You may return to Discord`, {
    status: 200,
  })
}

export async function saveUserAccessToken(app: App, token: D.RESTPostOAuth2AccessTokenResult) {
  const me = await app.bot.getOauthUser(token.access_token)

  if (me.user) {
    // save token
    await app.db.db.insert(AccessTokens).values({
      user_id: me.user.id,
      data: token,
      expires_at: new Date(Date.now() + token.expires_in * 1000),
    })
  } else {
    throw new AppErrors.MissingIdentifyScope()
  }
}

export async function getUserAccessToken(
  app: App,
  user_id: string,
  scopes?: D.OAuth2Scopes[],
): Promise<string | undefined> {
  const all_tokens = await app.db.access_tokens.get(user_id)

  const scope_tokens = scopes
    ? all_tokens.filter(token => {
        const token_scopes = token.data.data.scope.split(' ')
        return scopes.every(scope => token_scopes.includes(scope))
      })
    : all_tokens

  // get the most recent token
  const token = scope_tokens.sort(
    (a, b) => b.data.expires_at.getTime() - a.data.expires_at.getTime(),
  )[0]
  return refreshAccessToken(app.bot, token.data)
}

export async function refreshAccessToken(
  bot: DiscordAPIClient,
  token: AccessToken['data'],
): Promise<string> {
  return token.expires_at.getTime() > Date.now()
    ? token.data.access_token
    : (await bot.refreshOauthToken(token.data.refresh_token)).access_token
}
