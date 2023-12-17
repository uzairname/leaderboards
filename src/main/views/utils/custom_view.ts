import { StringDataSchema, View } from '../../../discord-framework'

export class CustomBaseView<Schema extends StringDataSchema> extends View<Schema> {
  constructor(options: { state_schema: Schema; custom_id_prefix?: string }) {
    super(options)
  }
}
