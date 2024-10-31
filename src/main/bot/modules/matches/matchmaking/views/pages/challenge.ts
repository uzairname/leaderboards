import * as D from 'discord-api-types/v10'
import {
  ChatInteractionResponse,
  ComponentContext,
  field,
  InteractionContext,
  MessageData,
  MessageView,
} from '../../../../../../../discord-framework'
import { App } from '../../../../../../app/App'
import { AppView } from '../../../../../../app/ViewModule'
import { Colors } from '../../../../../ui-helpers/constants'
import { checkGuildInteraction } from '../../../../../ui-helpers/perms'
import { relativeTimestamp } from '../../../../../ui-helpers/strings'
import { getOrCreatePlayer } from '../../../../players/manage-players'
import { start1v1SeriesThread } from '../../../management/match-creation'

export const challenge_message_signature = new MessageView({
  name: 'Challenge Message',
  custom_id_prefix: 'c',
  state_schema: {
    ranking_id: field.Int(),
    initiator_id: field.String(),
    opponent_id: field.String(),
    time_sent: field.Date(),
    best_of: field.Int(),
    opponent_accepted: field.Boolean(),
    ongoing_match_channel_id: field.String(),
    callback: field.Choice({
      accept,
    }),
  },
})

export default new AppView(challenge_message_signature, app =>
  challenge_message_signature.onComponent(async ctx => {
    if (!ctx.state.data.callback) throw new Error('Unhandled state')
    return await ctx.state.data.callback(app, ctx)
  }),
)

export async function challengeMessage(
  app: App,
  ctx: InteractionContext<typeof challenge_message_signature>,
): Promise<MessageData> {
  const initiator_id = ctx.state.get.initiator_id()
  const opponent_id = ctx.state.get.opponent_id()

  const expires_at = new Date(ctx.state.get.time_sent().getTime() + app.config.ChallengeTimeoutMs)
  const best_of = ctx.state.get.best_of()

  const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())

  const content = `### <@${initiator_id}> challenges <@${opponent_id}> to a 1v1`

  const embeds: D.APIEmbed[] = [
    {
      title: ``,
      description: ``
        + `Ranking: **${ranking.data.name}**`
        + `\nBest of **${best_of}**`
        + `\n` + ((ctx.state.is.opponent_accepted() && ctx.state.data.ongoing_match_channel_id)
          ? `Challenge accepted. New match started in <#${ctx.state.data.ongoing_match_channel_id}>`
          : `*Awaiting response*`)
        + `\n\n-# Expires ${relativeTimestamp(expires_at)}`
        + ``, // prettier-ignore
      color: Colors.Primary,
    },
  ]

  const components: D.APIActionRowComponent<D.APIMessageActionRowComponent>[] =
    !ctx.state.is.opponent_accepted()
      ? [
          {
            type: D.ComponentType.ActionRow,
            components: [
              {
                type: D.ComponentType.Button,
                style: D.ButtonStyle.Primary,
                custom_id: ctx.state.set.callback(accept).cId(),
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

async function accept(
  app: App,
  ctx: ComponentContext<typeof challenge_message_signature>,
): Promise<ChatInteractionResponse> {
  // check expiration
  const expires_at = new Date(ctx.state.get.time_sent().getTime() + app.config.ChallengeTimeoutMs)
  if (new Date() > expires_at) {
    await app.discord.deleteMessageIfExists(
      ctx.interaction.channel?.id,
      ctx.interaction.message?.id,
    )
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: { content: `This challenge has expired`, flags: D.MessageFlags.Ephemeral },
    }
  }

  // check challenges enabled
  const ranking = await app.db.rankings.get(ctx.state.get.ranking_id())
  if (!ranking.data.matchmaking_settings.direct_challenge_enabled) {
    await app.discord.deleteMessageIfExists(
      ctx.interaction.channel?.id,
      ctx.interaction.message?.id,
    )
    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `The ranking **${ranking.data.name}** does not allow direct challenges`,
        flags: D.MessageFlags.Ephemeral,
      },
    }
  }

  const interaction = checkGuildInteraction(ctx.interaction)

  const is_opponent = ctx.state.is.opponent_id(interaction.member.user.id)

  if (!is_opponent || ctx.state.is.opponent_accepted())
    return { type: D.InteractionResponseType.DeferredMessageUpdate }

  return ctx.defer(
    {
      type: D.InteractionResponseType.DeferredMessageUpdate,
    },
    async ctx => {
      ctx.state.save.opponent_accepted(true)

      const guild_ranking = await app.db.guild_rankings.get({
        guild_id: interaction.guild_id,
        ranking_id: ctx.state.get.ranking_id(),
      })

      const team_player_ids = [[ctx.state.get.initiator_id()], [ctx.state.get.opponent_id()]]

      const team_players = await Promise.all(
        team_player_ids.map(async team =>
          Promise.all(team.map(id => getOrCreatePlayer(app, id, guild_ranking.data.ranking_id))),
        ),
      )

      const { match, thread } = await start1v1SeriesThread(
        app,
        guild_ranking,
        team_players,
        ctx.state.get.best_of(),
      )

      ctx.state.save.ongoing_match_channel_id(thread.id)

      await ctx.edit((await challengeMessage(app, ctx)).as_response)
    },
  )
}
