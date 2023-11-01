import {
  APIActionRowComponent,
  APIMessageActionRowComponent,
  ButtonStyle,
  ComponentType,
  APITextInputComponent,
} from 'discord-api-types/v10'

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
