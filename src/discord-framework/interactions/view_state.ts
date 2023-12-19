import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { sentry } from '../../request/sentry'
import { StringData, StringDataSchema } from '../../utils/string_data'
import { findView_ } from './find_view'
import { AnyView, FindViewCallback } from './types'
import { ViewError, ViewErrors } from './utils/errors'
import { View } from './views'

export class ViewState<TSchema extends StringDataSchema> extends StringData<TSchema> {
  set: {
    [K in keyof TSchema]: (value: TSchema[K]['default_value']) => ViewState<TSchema>
  } = {} as any

  copy(): ViewState<TSchema> {
    let temp = new ViewState(this.view_id, this.schema)
    temp.data = {
      ...this.data,
    }
    return temp
  }

  setData(
    data: Partial<{ [K in keyof TSchema]: TSchema[K]['default_value'] }>,
  ): ViewState<TSchema> {
    return this.copy().saveData(data)
  }

  cId(): string {
    const encoded = compressToUTF16(`${this.view_id}.${super.encode()}`)
    if (encoded.length > 100) throw new ViewErrors.CustomIdTooLong(encoded)
    return encoded
  }

  private constructor(
    private view_id: string | undefined,
    protected schema: TSchema,
  ) {
    super(schema)
    for (const key in this.schema) {
      this.set[key] = (value: TSchema[typeof key]['default_value']) => this.copy().save[key](value)
    }
  }

  static make<T extends StringDataSchema>(view: View<T>): ViewState<T> {
    return new ViewState(view.options.custom_id_id, view.state_schema)
  }

  static async from(
    custom_id: string,
    findViewCallback: FindViewCallback,
  ): Promise<{ view: AnyView; state: ViewState<StringDataSchema> }> {
    let decompressed_custom_id = decompressFromUTF16(custom_id)

    if (!decompressed_custom_id)
      throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

    const [prefix, ...extra] = decompressed_custom_id.split('.')
    const encoded_data = extra.join('.')

    let view = await findView_(findViewCallback, undefined, prefix)
    let state = ViewState.make(view).decode(encoded_data || '')

    sentry.addBreadcrumb({
      category: 'custom_id',
      level: 'info',
      data: {
        custom_id,
        encoded_data,
        prefix,
        data: state.data,
      },
    })

    return { view, state }
  }
}
