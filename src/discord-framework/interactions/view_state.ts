import { findView } from './view_helpers'

import { StringDataSchema, StringData } from '../../utils/string_data'

import { decompressFromUTF16, compressToUTF16 } from 'lz-string'
import { AnyView, FindViewCallback } from './types'
import { ViewErrors } from './utils/errors'

export class ViewState<T extends StringDataSchema> extends StringData<T> {
  static create<View extends AnyView>(view: View): ViewState<View['options']['state_schema']> {
    return new ViewState(view, view.options.state_schema)
  }

  private constructor(
    private view: AnyView,
    protected schema: T,
  ) {
    super(view.options.state_schema)

    for (const key in this.schema) {
      this.set[key] = (value: T[typeof key]['default_value']) => {
        let temp = new ViewState(this.view, this.schema)
        temp.data = {
          ...this.data,
        }
        temp.data[key] = this.validateAndCompress(key, value)
        return temp
      }
    }
  }

  static async decode(
    custom_id: string,
    findViewCallback: FindViewCallback,
  ): Promise<{ view: AnyView; state: ViewState<StringDataSchema> }> {
    let decompressed_custom_id = decompressFromUTF16(custom_id)

    if (!decompressed_custom_id)
      throw new ViewErrors.InvalidEncodedCustomId(`Unable to decode custom id ${custom_id}`)

    const [prefix, ...extra] = decompressed_custom_id.split('.')
    const encoded_data = extra.join('.')

    let view = await findView(findViewCallback, undefined, prefix)

    let state = new ViewState(view, view.options.state_schema).decode(encoded_data || '')

    return { view, state }
  }

  set = {} as {
    [K in keyof T]: (value: T[K]['default_value']) => ViewState<T>
  }

  setData(data: {
    [K in keyof T]?: T[K]['default_value']
  }): ViewState<T> {
    let temp = new ViewState(this.view, this.schema)
    temp.data = Object.entries(data).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = this.validateAndCompress(key, value)
      }
      return acc
    }, {} as any)
    return temp
  }

  encode(): string {
    const encoded = compressToUTF16(`${this.view.options.custom_id_prefix}.${super.encode()}`)
    if (encoded.length > 100) throw new ViewErrors.CustomIdTooLong(encoded)
    return encoded
  }
}
