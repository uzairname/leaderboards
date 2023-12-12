import { OAuth2Scopes, RESTPostOAuth2AccessTokenResult } from 'discord-api-types/v10'

import { DiscordRESTClient } from '../../discord-framework'
import { assertValue } from '../../utils/utils'

import { updateUserRoleConnectionData } from './linked_roles'
import { sentry } from '../../logging/globals'
import { AppErrors, UserErrors } from '../errors'
import { App } from '../app'

export function oauthRedirect(app: App, scopes: OAuth2Scopes[]): Response {
  const state = crypto.randomUUID()
  const url = app.bot.oauthRedirectURL(app.config.OAUTH_REDIRECT_URI, scopes, state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Set-Cookie': `state=${state}; HttpOnly; Secure; Max-Age=300; path=/`,
    },
  })
}

export async function oauthCallback(app: App, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const client_state = request.headers.get('Cookie')?.split('state=')[1]?.split(';')[0]
  const discord_state = url.searchParams.get('state')

  if (client_state !== discord_state) {
    return new Response('Invalid state', { status: 400 })
  }

  try {
    const code = url.searchParams.get('code')
    assertValue(code)
    var tokendata = await app.bot.getOauthToken(code, app.config.OAUTH_REDIRECT_URI)
  } catch (e) {
    sentry.catchAfterResponding(e)
    return new Response('Invalid code', { status: 400 })
  }

  await saveUserAccessToken(app, tokendata)

  return new Response(`Authorized. You may return to Discord`, {
    status: 200,
  })
}

export async function saveUserAccessToken(app: App, token: RESTPostOAuth2AccessTokenResult) {
  const me = await app.bot.getOauthUser(token.access_token)
  const expires_at = Date.now() + token.expires_in * 1000

  if (me.user) {
    // save token
  } else {
    throw new AppErrors.MissingIdentifyScope()
  }

  if (me.scopes.includes(OAuth2Scopes.RoleConnectionsWrite)) {
    sentry.waitUntil(updateUserRoleConnectionData(app, token.access_token, 10, 'test'))
  }
}

type StoredToken = {
  access_token: string
  refresh_token: string
  expires_at: number
}

export async function refreshAccessToken(
  bot: DiscordRESTClient,
  tokens: StoredToken,
): Promise<string> {
  if (Date.now() < tokens.expires_at) {
    return tokens.access_token
  }

  const response = await bot.refreshOauthToken(tokens.refresh_token)
  return response.access_token
}
