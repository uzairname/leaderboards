import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { sentry } from '../../logging'
import { StringData, StringDataSchema } from '../../utils/string_data'
import { ViewErrors } from './errors'
import { findView } from './find_view'
import { AnyView } from './types'
import { BaseView } from './views'

export class ViewState<TSchema extends StringDataSchema> extends StringData<TSchema> {
  set = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['write'] | null | undefined) => ViewState<TSchema>
  }

  setAll(data: { [K in keyof TSchema]?: TSchema[K]['write'] | null }): ViewState<TSchema> {
    return this.copy().saveAll(data)
  }

  copy(): ViewState<TSchema> {
    return new ViewState(this.schema, this.view_id).decode(this.encode())
  }

  cId(): string {
    const encoded = compressToUTF16(`${this.view_id}.${super.encode()}`)
    if (encoded.length > 100) throw new ViewErrors.CustomIdTooLong(encoded)
    return encoded
  }

  private constructor(
    protected schema: TSchema,
    private view_id: string | undefined,
  ) {
    super(schema)
    for (const key in this.schema) {
      this.set[key] = value => this.copy().save[key](value)
    }
  }

  static fromView<T extends StringDataSchema>(view: BaseView<T>): ViewState<T> {
    return new ViewState(view.state_schema, view.options.custom_id_prefix)
  }

  static fromCustomId(
    custom_id: string,
    findViewCallback: any,
  ): { view: AnyView; state: ViewState<StringDataSchema> } {
    let decompressed_custom_id = decompressFromUTF16(custom_id)

    if (!decompressed_custom_id)
      throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

    const [prefix, ...extra] = decompressed_custom_id.split('.')
    const encoded_data = extra.join('.')

    let view = findView(findViewCallback, undefined, prefix)
    let state = ViewState.fromView(view)
    if (encoded_data) {
      state = state.decode(encoded_data)
    }

    sentry.addBreadcrumb({
      category: 'decoded custom_id',
      level: 'info',
      data: {
        encoded_data,
        prefix,
        data: state.data,
      },
    })

    return { view, state }
  }
}
