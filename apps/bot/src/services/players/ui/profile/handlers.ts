import { ChatInteractionResponse, ComponentContext, Context } from '@repo/discord'
import { intOrUndefined } from '@repo/utils'
import * as D from 'discord-api-types/v10'
import { ProfilePages } from '.'
import { App } from '../../../../setup/app'
import { profile_view_sig } from './view'

export async function main(app: App, ctx: Context<typeof profile_view_sig>): Promise<ChatInteractionResponse> {
  return {
    type: D.InteractionResponseType.UpdateMessage,
    data: await ProfilePages.main(app, ctx),
  }
}

/**
 * A ranking is selected throuh the select menu
 */
export async function onRankingSelect(
  app: App,
  ctx: ComponentContext<typeof profile_view_sig>,
): Promise<ChatInteractionResponse> {
  const ranking_id = intOrUndefined((ctx.interaction.data as D.APIMessageStringSelectInteractionData).values[0])
  ctx.state.save.ranking_id(ranking_id)
  return ctx.defer(async ctx => void ctx.edit(await ProfilePages.main(app, ctx)))
}
