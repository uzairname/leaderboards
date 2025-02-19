import * as D from 'discord-api-types/v10'
import {
  AnyGuildInteractionContext,
  MessageView,
  StateContext,
} from 'discord-framework'
import { field } from '../../../../../../../utils/StringData'
import { App } from '../../../../setup/app'
import { UserErrors } from '../../../../errors/UserError'
import { Colors } from '../../../../ui-helpers/constants'
import { Messages } from '../../../../ui-helpers/messages'
import { escapeMd } from '../../../../ui-helpers/strings'
import { AppView } from '../../../ViewModule'
import * as handlers from './ranking-settings-handlers'

export const ranking_settings_page_config = new MessageView({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    component_owner_id: field.String(),
    guild_id: field.String(),
    ranking_id: field.Int(),
    handler: field.Choice(handlers),
  },
  guild_only: true,
})

export default new AppView(ranking_settings_page_config, app =>
  ranking_settings_page_config.onComponent(async ctx => {
    if (
      ctx.state.data.component_owner_id &&
      ctx.state.data.component_owner_id !== ctx.interaction.member.user.id
    ) {
      throw new UserErrors.NotComponentOwner(ctx.state.data.component_owner_id)
    }

    if (ctx.state.data.handler) {
      return ctx.state.data.handler(app, ctx)
    } else {
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await _rankingSettingsPage(app, ctx),
      }
    }
  }),
)

export async function rankingSettingsPage({
  app,
  ranking_id,
  ctx,
}: {
  app: App
  ranking_id: number
  ctx: AnyGuildInteractionContext
}) {
  return _rankingSettingsPage(app, {
    state: ranking_settings_page_config.newState({
      guild_id: ctx.interaction.guild_id,
      ranking_id,
      component_owner_id: ctx.interaction.member.user.id,
    }),
  })
}

/**
 * The main ranking settings page
 */
export async function _rankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_page_config>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild_ranking, ranking } = await app.db.guild_rankings
    .get(ctx.state.get.guild_id(), ctx.state.get.ranking_id())
    .fetch()

  const embed: D.APIEmbed = {
    title: `Ranking Settings`,
    description:
      `## ${escapeMd(ranking.data.name)}` +
      `\n` +
      (await Messages.guildRankingDescription(app, guild_ranking, true)),
    color: Colors.Primary,
  }

  let buttons1: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `Edit`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(handlers.editBtn).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: guild_ranking.data.display_settings?.leaderboard_message
          ? `Disable Live Leaderboard`
          : `Send Live Leaderboard`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(handlers.toggleLiveLeaderboard).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: ranking.data.matchmaking_settings?.direct_challenge_enabled
          ? `Disable Direct Challenges`
          : `Enable Direct Challenges`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(handlers.toggleChallenge).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: `Delete`,
        style: D.ButtonStyle.Danger,
        custom_id: ctx.state.set.handler(handlers.deleteBtn).cId(),
      },
    ],
  }

  const web_settings_url = `${app.config.WebDashboardURL}/ranking/${ctx.state.get.ranking_id()}`
  if (app.config.features.WebDashboardEnabled) {
    buttons1.components.push({
      type: D.ComponentType.Button,
      label: `Web Settings`,
      style: D.ButtonStyle.Link,
      url: web_settings_url,
    })
  }

  const buttons2: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `All Rankings`,
        style: D.ButtonStyle.Secondary,
        custom_id: ctx.state.set.handler(handlers.allRankings).cId(),
        emoji: {
          name: '⬅️',
        },
      },
    ],
  }

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = [buttons1, buttons2]

  return {
    flags: D.MessageFlags.Ephemeral,
    embeds: [embed],
    components,
  }
}
