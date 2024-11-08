import { sentry } from '../../logging/sentry'
import { LZString } from '../../utils/lzstring'
import { StringData, StringDataSchema } from '../../utils/StringData'
import { InteractionErrors } from './errors'
import { AnyView } from './types'
import { BaseView } from './views'

export class ViewState<T extends StringDataSchema> extends StringData<T> {
  set = {} as {
    [K in keyof T]: (value: T[K]['type'] | null | undefined) => ViewState<T>
  }

  setAll(data: { [K in keyof T]?: T[K]['type'] | null }): ViewState<T> {
    return this.copy().saveAll(data)
  }

  copy(): ViewState<T> {
    return new ViewState(this.schema, this.view_id).decode(this.encode())
  }

  cId(): string {
    const encoded = LZString.compressToUTF16(`${this.view_id}.${super.encode()}`)
    if (encoded.length > 100) throw new InteractionErrors.CustomIdTooLong(encoded)
    return encoded
  }

  protected constructor(
    protected schema: T,
    private view_id: string | undefined,
  ) {
    super(schema)
    for (const key in this.schema) {
      this.set[key] = value => this.copy().save[key](value)
    }
  }
}

export abstract class ViewStateFactory<T extends StringDataSchema> extends ViewState<T> {
  static fromView<T extends StringDataSchema>(view: BaseView<T, any>): ViewState<T> {
    return new ViewState(view.state_schema, view.config.custom_id_prefix)
  }

  private static splitCustomId(custom_id: string): [string, string] {
    const decompressed_custom_id = LZString.decompressFromUTF16(custom_id)

    if (!decompressed_custom_id) throw new InteractionErrors.InvalidEncodedCustomId(custom_id)

    const [prefix, ...rest] = decompressed_custom_id.split('.')
    const encoded_data = rest.join('.')

    return [prefix, encoded_data]
  }

  static fromCustomId(
    custom_id: string,
    customIdPrefixToViewHandlers: (custom_id_prefix: string) => AnyView,
  ): { view: AnyView; state: ViewState<StringDataSchema> } {
    const [prefix, encoded_data] = ViewStateFactory.splitCustomId(custom_id)
    const view = customIdPrefixToViewHandlers(prefix)
    const blank_state = ViewStateFactory.fromView(view)
    const state = encoded_data ? blank_state.decode(encoded_data) : blank_state

    sentry.addBreadcrumb({
      category: 'decoded custom_id',
      level: 'info',
      data: {
        view_name: view.name,
        encoded_data,
        prefix,
        data: state.data,
      },
    })

    return { view, state }
  }
}
