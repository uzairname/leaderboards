import {
  APIActionRowComponent,
  APIMessageActionRowComponent,
  APITextInputComponent,
  ComponentType,
  ButtonStyle,
  APIModalSubmitInteraction,
  ModalSubmitComponent,
} from 'discord-api-types/v10'

import { clone_json } from '../../../utils/utils'

import { decodeCustomId } from '../view_helpers'

export function replaceMessageComponentsCustomIds(
  components:
    | APIActionRowComponent<APIMessageActionRowComponent>[]
    | APIActionRowComponent<APITextInputComponent>[]
    | undefined
    | null,
  replace: (data?: string) => string,
): void {
  components?.forEach((row) => {
    row.components.forEach((component) => {
      if (
        component.type === ComponentType.TextInput ||
        component.type === ComponentType.StringSelect ||
        component.type === ComponentType.MentionableSelect ||
        component.type === ComponentType.UserSelect ||
        component.type === ComponentType.RoleSelect ||
        component.type === ComponentType.ChannelSelect ||
        (component.type === ComponentType.Button && component.style !== ButtonStyle.Link)
      ) {
        component.custom_id = replace(component.custom_id)
      }
    })
  })
}

export function getModalSubmitEntries(
  interaction: APIModalSubmitInteraction,
): ModalSubmitComponent[] {
  let modal_submit_components: ModalSubmitComponent[] = []
  interaction.data.components.forEach((row) => {
    row.components.forEach((component) => {
      let component_copy = clone_json(component)
      component_copy.custom_id = decodeCustomId(component.custom_id).content.toString()
      modal_submit_components.push(component_copy)
    })
  })
  return modal_submit_components
}
