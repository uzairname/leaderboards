import { APIActionRowComponent, ApplicationCommandType } from 'discord-api-types/v10'
import {
  BaseView,
  CommandView,
  MessageView,
  ViewCreateMessageCallback,
} from '../../discord/interactions/views'
import { StringDataSchema } from '../../discord/interactions/utils/string_data'

export class CustomBaseView<Schema extends StringDataSchema> extends BaseView<Schema> {
  constructor(options: { state_schema: Schema; custom_id_prefix?: string }) {
    super(options)
  }
}
