import { CommandSignature, getOptions } from '@repo/discord'
import { nonNullable } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../../logging/sentry'
import { getUserAccessToken } from '../../../routers/oauth'
import { App } from '../../../setup/app'
import { getOrCreatePlayer } from '../../players/manage-players'
import { updateUserRoleConnectionData } from '../role-connections'

export const connect_cmd_sig = new CommandSignature({
  type: D.ApplicationCommandType.ChatInput,
  name: 'connect',
  description: `Connect your account to a ranking to display on your profile`,
  guild_only: false,
  options: [
    {
      type: D.ApplicationCommandOptionType.Integer,
      name: 'ranking',
      description: `The ranking to connect your profile to`,
      required: true,
      autocomplete: true,
    },
  ],
  experimental: true,
})

export const connect_cmd = connect_cmd_sig.set<App>({
  onCommand: async (ctx, app) => {
    return ctx.defer(async ctx => {
      const input = getOptions(ctx.interaction, {
        ranking: { type: D.ApplicationCommandOptionType.Integer, required: true },
      })

      const user_id = nonNullable(ctx.interaction.member?.user.id ?? ctx.interaction.user?.id, 'user/member id')

      const access_token = await getUserAccessToken(app, user_id, [D.OAuth2Scopes.RoleConnectionsWrite])
      if (!access_token) {
        return void ctx.edit({
          content: `You need to authorize the bot to connect your account to a ranking. Please follow these steps:
1. Go to any server where the bot is present and a linked role is available.
2. Click on the server settings dropdown and select "Linked Roles"
3. Click on a role associated with this bot
4. Follow the steps given to verify your account. This will ask you to authorize the bot to update your role connection metadata.
5. Come back here and run the command again.`,
          components: [
            {
              type: D.ComponentType.ActionRow,
              components: [
                {
                  type: D.ComponentType.Button,
                  style: D.ButtonStyle.Link,
                  label: `Authorize`,
                  url: app.config.OauthRoleConnectionsUrl,
                },
              ],
            },
          ],
        })
      }

      const player = await getOrCreatePlayer(app, user_id, app.db.rankings.get(input.ranking))

      const result = await updateUserRoleConnectionData(app, access_token, player)

      await ctx.edit({
        content: `Updated your profile's main ranking to \`${result.ranking.data.name}\`, with data \`${JSON.stringify(result.metadata)}\``,
      })
    })
  },
  onAutocomplete: async (ctx, app) => {
    // Get the user's rankings
    const user_id = nonNullable(ctx.interaction.member?.user.id ?? ctx.interaction.user?.id, 'user/member id')

    const players = await app.db.users.get(user_id).players()

    const choices: D.APIApplicationCommandOptionChoice[] = players.map(p => ({
      name: p.ranking.data.name,
      value: p.ranking.data.id,
    }))

    sentry.debug(`autocomplete`, { choices })

    return {
      choices,
    }
  },
})
