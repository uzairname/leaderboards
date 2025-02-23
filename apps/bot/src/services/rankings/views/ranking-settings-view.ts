import { AnyGuildInteractionContext, StateContext, ViewSignature } from '@repo/discord'
import { field } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { App } from '../../../setup/app'
import { Colors, escapeMd, Messages } from '../../../utils/ui'
import * as handlers from './ranking-settings-handlers'

export const ranking_settings_view_sig = new ViewSignature({
  name: 'ranking settings',
  custom_id_prefix: 'rs',
  state_schema: {
    guild_id: field.String(),
    ranking_id: field.Int(),
    handler: field.Choice(handlers),
  },
  guild_only: true,
})

export const ranking_settings_view = ranking_settings_view_sig.set<App>({
  onComponent: async (ctx, app) => {
    if (ctx.state.data.handler) {
      return ctx.state.data.handler(app, ctx)
    } else {
      return {
        type: D.InteractionResponseType.UpdateMessage,
        data: await rankingSettingsPage(app, ctx),
      }
    }
  },
})

export async function getRankingSettingsPage({
  app,
  ranking_id,
  ctx,
}: {
  app: App
  ranking_id: number
  ctx: AnyGuildInteractionContext
}) {
  return rankingSettingsPage(app, {
    state: ranking_settings_view_sig.newState({
      guild_id: ctx.interaction.guild_id,
      ranking_id,
    }),
  })
}

/**
 * The main ranking settings page
 */
export async function rankingSettingsPage(
  app: App,
  ctx: StateContext<typeof ranking_settings_view_sig>,
): Promise<D.APIInteractionResponseCallbackData> {
  const { guild, guild_ranking, ranking } = await app.db.guild_rankings
    .get(ctx.state.get.guild_id(), ctx.state.get.ranking_id())
    .fetch()

  const embed: D.APIEmbed = {
    title: `Ranking Settings`,
    description:
      `## ${escapeMd(ranking.data.name)}` + `\n` + (await Messages.guildRankingDescription(app, guild_ranking, true)),
    color: Colors.Primary,
  }

  let buttons1: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `Edit`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(handlers.onEditBtn).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: guild_ranking.data.display_settings?.leaderboard_message
          ? `Disable Live Leaderboard`
          : `Send Live Leaderboard`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(handlers.onToggleLiveLeaderboard).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: ranking.data.matchmaking_settings?.direct_challenge_enabled
          ? `Disable Direct Challenges`
          : `Enable Direct Challenges`,
        style: D.ButtonStyle.Primary,
        custom_id: ctx.state.set.handler(handlers.onToggleChallenge).cId(),
      },
      {
        type: D.ComponentType.Button,
        label: `Delete`,
        style: D.ButtonStyle.Danger,
        custom_id: ctx.state.set.handler(handlers.onDeleteBtn).cId(),
      },
    ],
  }

  if (app.config.features.WebDashboardEnabled) {
    throw new Error('Not implemented')
    // const web_settings_url = `${app.config.WebDashboardURL}/ranking/${ctx.state.get.ranking_id()}`
    // buttons1.components.push({
    //   type: D.ComponentType.Button,
    //   label: `Web Settings`,
    //   style: D.ButtonStyle.Link,
    //   url: web_settings_url,
    // })
  }

  const buttons2: D.APIActionRowComponent<D.APIButtonComponent> = {
    type: D.ComponentType.ActionRow,
    components: [
      {
        type: D.ComponentType.Button,
        label: `Back`,
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
