import { Context } from '@repo/discord'
import * as D from 'discord-api-types/v10'
import { HelpPages } from '.'
import { App } from '../../../setup/app'
import { inviteUrl } from '../../../utils'
import { help_view_sig } from './view'

// Nav buttons
export async function helpComponents(
  app: App,
  ctx: Context<typeof help_view_sig>,
): Promise<D.APIActionRowComponent<D.APIComponentInMessageActionRow>[]> {
  let components: D.APIButtonComponent[] = []

  console.log(`help components`)

  components = components.concat([
    {
      type: D.ComponentType.Button,
      custom_id: ctx.state.set.page(HelpPages.overviewPage).cId(),
      label: 'Overview',
      style: D.ButtonStyle.Secondary,
      disabled: ctx.state.is.page(HelpPages.overviewPage),
    },
    {
      type: D.ComponentType.Button,
      custom_id: ctx.state.set.page(HelpPages.adminGuidePage).cId(),
      label: 'Admin Guide',
      style: D.ButtonStyle.Primary,
      disabled: ctx.state.is.page(HelpPages.adminGuidePage),
    },
    {
      type: D.ComponentType.Button,
      custom_id: ctx.state.set.page(HelpPages.playerGuidePage).cId(),
      label: 'Player Guide',
      style: D.ButtonStyle.Primary,
      disabled: ctx.state.is.page(HelpPages.playerGuidePage),
    },
    {
      type: D.ComponentType.Button,
      custom_id: ctx.state.set.page(HelpPages.ratingsPage).cId(),
      label: 'Ratings',
      style: D.ButtonStyle.Primary,
      disabled: ctx.state.is.page(HelpPages.ratingsPage),
    },
  ])

  const action_rows: D.APIActionRowComponent<D.APIComponentInMessageActionRow>[] = [
    {
      type: D.ComponentType.ActionRow,
      components,
    },
  ]

  if (ctx.state.is.page(HelpPages.overviewPage) && app.config.features.GiveBotInvite) {
    action_rows.push({
      type: D.ComponentType.ActionRow,
      components: [
        {
          type: D.ComponentType.Button,
          url: inviteUrl(app),
          label: 'Invite to Server',
          style: D.ButtonStyle.Link,
        },
      ],
    })
  }

  return action_rows
}
