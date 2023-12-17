import { compressToUTF16, decompressFromUTF16 } from 'lz-string'
import { StringData, StringDataSchema } from '../../utils/string_data'
import { findView_ } from './find_view'
import { AnyView, FindViewCallback } from './types'
import { ViewError, ViewErrors } from './utils/errors'
import { View } from './views'

export class ViewState<Schema extends StringDataSchema> extends StringData<Schema> {
  static make<T extends StringDataSchema>(view: View<T>): ViewState<T> {
    return new ViewState(view.options.custom_id_prefix, view.options.state_schema)
  }

  private constructor(
    private view_id: string | undefined,
    protected schema: Schema
  ) {
    super(schema)

    for (const key in this.schema) {
      this.set[key] = (value: Schema[typeof key]['default_value']) => {
        let temp = new ViewState(this.view_id, this.schema)
        temp.data = {
          ...this.data
        }
        temp.data[key] = this.validateAndCompress(key, value)
        return temp
      }
    }
  }

  static async decode(
    custom_id: string,
    findViewCallback: FindViewCallback
  ): Promise<{ view: AnyView; state: ViewState<StringDataSchema> }> {
    let decompressed_custom_id = decompressFromUTF16(custom_id)

    if (!decompressed_custom_id)
      throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

    const [prefix, ...extra] = decompressed_custom_id.split('.')
    const encoded_data = extra.join('.')

    let view = await findView_(findViewCallback, undefined, prefix)
    let state = ViewState.make(view).decode(encoded_data || '')

    return { view, state }
  }

  set = {} as {
    [K in keyof Schema]: (value: Schema[K]['default_value']) => ViewState<Schema>
  }

  setAll(data: {
    [K in keyof Schema]?: Schema[K]['default_value']
  }): ViewState<Schema> {
    let temp = new ViewState(this.view_id, this.schema)
    temp.data = Object.entries(data).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = this.validateAndCompress(key, value)
      }
      return acc
    }, {} as any)
    return temp
  }

  encode(): string {
    const encoded = compressToUTF16(`${this.view_id}.${super.encode()}`)
    if (encoded.length > 100) throw new ViewErrors.CustomIdTooLong(encoded)
    return encoded
  }
}
