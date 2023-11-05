import { APIBaseInteraction, APIGuildInteractionWrapper } from 'discord-api-types/v10'
import { AppErrors } from '../../messages/errors'
import { isGuildInteraction } from 'discord-api-types/utils/v10'

export function checkGuildInteraction<T extends APIBaseInteraction<any, any>>(
  interaction: T,
): APIGuildInteractionWrapper<T> {
  if (!isGuildInteraction(interaction)) {
    throw new AppErrors.InteractionNotGuild()
  }
  return interaction as APIGuildInteractionWrapper<T>
}
