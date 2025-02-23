import {
  ChatInteractionResponse,
  checkGuildInteraction,
  ComponentContext,
  MessageData,
  ViewSignature,
  ViewState,
} from '@repo/discord'
import { field, sequential } from '@repo/utils'
import { Colors } from 'apps/bot/src/utils/ui'
import * as D from 'discord-api-types/v10'
import { App } from '../../../../setup/app'
import { relativeTimestamp } from '../../../../utils/ui'
import { getRegisterPlayer } from '../../../players/manage-players'
import { rankingProperties } from '../../../rankings/ranking-properties'
import { start1v1SeriesThread } from '../../ongoing-math-thread/manage-ongoing-match'

export const challenge_view_sig = new ViewSignature({
  name: 'Challenge Page',
  custom_id_prefix: 'c',
  state_schema: {
    ranking_id: field.Int(),
    initiator_id: field.String(),
    opponent_id: field.String(),
    time_sent: field.Date(),
    best_of: field.Int(),
    opponent_accepted: field.Boolean(),
    ongoing_match_channel_id: field.String(),
    callback: field.Choice({ accept }),
  },
})

export const challenge_view = challenge_view_sig.set<App>({
  onComponent: async (ctx, app) => ctx.state.get.callback()(app, ctx),
})

export async function renderChallengePage(
  app: App,
  data: ViewState<typeof challenge_view_sig.state_schema>['data'],
): Promise<MessageData> {
  const state = challenge_view_sig.newState(data)

  const initiator_id = state.get.initiator_id()
  const opponent_id = state.get.opponent_id()

  const expires_at = new Date(state.get.time_sent().getTime() + app.config.ChallengeTimeoutMs)

  const ranking = await app.db.rankings.fetch(state.get.ranking_id())
  const best_of = state.get.best_of() ?? rankingProperties(ranking).default_best_of

  const content = `### <@${initiator_id}> challenges <@${opponent_id}> to a 1v1`

  const embeds: D.APIEmbed[] = [
    {
      title: ``,
      description: ``
        + `Ranking: **${ranking.data.name}**`
        + `\nBest of **${best_of}**`
        + `\n` + ((state.is.opponent_accepted() && state.data.ongoing_match_channel_id)
          ? `Challenge accepted. New match started in <#${state.data.ongoing_match_channel_id}>`
          : `*Awaiting response*`)
        + `\n\n-# Expires ${relativeTimestamp(expires_at)}`
        + ``, // prettier-ignore
      color: Colors.Primary,
    },
  ]

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] = !state.is.opponent_accepted()
    ? [
        {
          type: D.ComponentType.ActionRow,
          components: [
            {
              type: D.ComponentType.Button,
              style: D.ButtonStyle.Primary,
              custom_id: state.set.callback(accept).cId(),
              label: 'Accept',
            },
          ],
        },
      ]
    : []

  return new MessageData({
    content,
    embeds,
    components,
    allowed_mentions: { users: [opponent_id] },
  })
}

async function accept(app: App, ctx: ComponentContext<typeof challenge_view_sig>): Promise<ChatInteractionResponse> {
  // check expiration
  const expires_at = new Date(ctx.state.get.time_sent().getTime() + app.config.ChallengeTimeoutMs)
  if (new Date() > expires_at) {
    await app.discord.deleteMessageIfExists(ctx.interaction.channel?.id, ctx.interaction.message?.id)
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: { content: `This challenge has expired`, flags: D.MessageFlags.Ephemeral },
    }
  }

  // Check whether direct challenges are enabled in this ranking
  const interaction = checkGuildInteraction(ctx.interaction)
  const { guild_ranking, ranking } = await app.db.guild_rankings
    .get(interaction.guild_id, ctx.state.get.ranking_id())
    .fetch()

  if (!ranking.data.matchmaking_settings.direct_challenge_enabled) {
    await app.discord.deleteMessageIfExists(ctx.interaction.channel?.id, ctx.interaction.message?.id)
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `The ranking **${ranking.data.name}** does not allow direct challenges`,
        flags: D.MessageFlags.Ephemeral,
      },
    }
  }

  // ensure that the acceptor is the opponent, and that the challenge hasn't been accepted yet
  if (!ctx.state.is.opponent_id(interaction.member.user.id) || ctx.state.is.opponent_accepted())
    return { type: D.InteractionResponseType.DeferredMessageUpdate }

  // accept the challenge
  return ctx.defer(async ctx => {
      ctx.state.save.opponent_accepted(true)

      // User ids that will participate in the match
      const user_ids = [[ctx.state.get.initiator_id()], [ctx.state.get.opponent_id()]]

      // Register them as players in the ranking
      const players = await sequential(
        user_ids.map(team => () => sequential(team.map(i => () => getRegisterPlayer(app, i, ranking)))),
      )

      // Start the match
      const { thread } = await start1v1SeriesThread(app, guild_ranking, players, ctx.state.data.best_of)

      // Update the challenge message
      ctx.state.save.ongoing_match_channel_id(thread.id)
      await ctx.edit((await renderChallengePage(app, ctx.state.data)).as_response)
    },
  )
}
