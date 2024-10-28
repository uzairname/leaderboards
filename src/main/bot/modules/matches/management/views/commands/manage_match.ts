import * as D from 'discord-api-types/v10'
import { AppCommand } from '../../../../../../../discord-framework'
import { nonNullable } from '../../../../../../../utils/utils'
import { AppView } from '../../../../../../app/ViewModule'
import { manage_match_page_signature, matchPage } from '../pages/manage_match'

const optionnames = {
  match_id: `match-id`,
}

export const manage_match_cmd_signature = new AppCommand({
  name: `match`,
  type: D.ApplicationCommandType.ChatInput,
  description: `Edit, revert, or view details of a specific match`,
  options: [
    {
      type: D.ApplicationCommandOptionType.Integer,
      name: `match-id`,
      description: `The match id. You can find this number in the match logs or by using /matches`,
      required: true,
    },
  ],
})

export default new AppView(manage_match_cmd_signature, app =>
  manage_match_cmd_signature.onCommand(async ctx => {
    const match_id_option_value = nonNullable(
      ctx.interaction.data.options?.find(
        o => o.name === optionnames.match_id,
      ) as D.APIApplicationCommandInteractionDataIntegerOption,
      'match_id option',
    ).value

    return {
      type: D.InteractionResponseType.ChannelMessageWithSource,
      data: await matchPage(app, {
        state: manage_match_page_signature.createState({
          match_id: match_id_option_value,
        }),
      }),
    }
  }),
)
