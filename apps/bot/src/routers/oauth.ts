import { DiscordAPIError } from '@discordjs/rest'
import { AccessToken } from '@repo/db/models'
import { DiscordAPIClient, DiscordErrors } from '@repo/discord'
import { nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { IttyRouter } from 'itty-router/IttyRouter'
import { App } from '../setup/app'

export default (app: App) =>
  IttyRouter({ base: `/oauth` })
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

function oauthRedirect(app: App, scopes: D.OAuth2Scopes[], bot_permissions?: bigint, redirect_uri?: string): Response {
  const state = crypto.randomUUID()

  const url = app.discord.oauthURL(redirect_uri ?? app.config.OauthRedirectURI, scopes, state, bot_permissions)

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': `state=${state}; HttpOnly; Secure; Max-Age=300; path=/;`,
    },
  })
}

async function oauthCallback(app: App, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const client_state = request.headers.get('Cookie')?.split('state=')[1]?.split(';')[0]
  const discord_state = url.searchParams.get('state')

  if (client_state !== discord_state) {
    return new Response('Invalid state', { status: 403 })
  }

  try {
    await saveUserAccessToken(
      app,
      await app.discord.getOauthToken(nonNullable(url.searchParams.get('code'), 'code'), app.config.OauthRedirectURI),
    )
  } catch (e) {
    if (e instanceof DiscordAPIError) {
      app.logger.debug(`Error: ${e.name} ${e.message}`)
      return new Response('Invalid code', { status: 400 })
    }
    throw e
  }

  return new Response(`Authorized. You may return to Discord`, {
    status: 200,
  })
}

export async function saveUserAccessToken(app: App, token: D.RESTPostOAuth2AccessTokenResult) {
  const me = await app.discord.getOauthUser(token.access_token)

  if (me.user) {
    // save token
    const user = await app.db.users.getOrCreate({
      id: me.user.id,
      name: me.user.global_name ?? me.user.username,
    })
    await app.db.access_tokens.create({
      user,
      data: token,
      expires_at: new Date(Date.now() + token.expires_in * 1000),
    })
  } else {
    throw new Error("Can't save oauth token: No identify scope")
  }
}

export async function getUserAccessToken(
  app: App,
  user_id: string,
  scopes?: D.OAuth2Scopes[],
): Promise<string | undefined> {
  app.logger.debug(`Getting user access token for ${user_id}`)

  const all_tokens = await app.db.access_tokens.get(user_id)

  const scope_tokens = scopes
    ? all_tokens.filter(token => {
        const token_scopes = token.data.data.scope.split(' ')
        return scopes.every(scope => token_scopes.includes(scope))
      })
    : all_tokens

  if (scope_tokens.length == 0) return undefined

  // Get the most recent token
  const token = scope_tokens.sort((a, b) => b.data.expires_at.getTime() - a.data.expires_at.getTime())[0]

  try {
    return await refreshAccessTokenIfExpired(app.discord, token.data)
  } catch (e) {
    if (e instanceof DiscordErrors.InvalidGrant) {
      // The token is invalid. Delete it
      await token.delete()
      return
    }
    throw e
  }
}

async function refreshAccessTokenIfExpired(bot: DiscordAPIClient, token: AccessToken['data']): Promise<string> {
  if (token.expires_at.getTime() > Date.now()) {
    return token.data.access_token
  } else {
    return (await bot.refreshOauthToken(token.data.refresh_token)).access_token
  }
}
