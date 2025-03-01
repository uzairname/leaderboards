import { LZString, StringData, StringDataSchema } from '@repo/utils'
import { InteractionErrors } from '../errors'
import { ViewSignature } from './signature'

export class ViewState<T extends StringDataSchema> extends StringData<T> {
  set = {} as {
    [K in keyof T]: (value: T[K]['type'] | null | undefined) => ViewState<T>
  }

  setAll(data: { [K in keyof T]?: T[K]['type'] | null }): ViewState<T> {
    return this.copy().saveAll(data)
  }

  copy(): ViewState<T> {
    return new ViewState(this.schema, this.cid_prefix).parse(this.encode())
  }

  cId(): string {
    const encoded = LZString.compressToUTF16(`${this.cid_prefix}.${super.encode()}`)
    if (encoded.length > 100) throw new InteractionErrors.CustomIdTooLong(encoded)
    return encoded
  }

  protected constructor(
    protected schema: T,
    private cid_prefix: string | undefined,
  ) {
    super(schema)
    for (const key in this.schema) {
      this.set[key] = value => this.copy().save[key](value)
    }
  }
}

export abstract class ViewStateFactory<T extends StringDataSchema> extends ViewState<T> {
  static fromSignature<T extends StringDataSchema>(signature: ViewSignature<T, any>): ViewState<T> {
    return new ViewState(signature.state_schema, signature.config.custom_id_prefix)
  }

  static splitCustomId(custom_id: string): { prefix: string; encoded_data: string } {
    const decompressed_custom_id = LZString.decompressFromUTF16(custom_id)

    if (!decompressed_custom_id) throw new InteractionErrors.DecompressError(custom_id)

    const [prefix, ...rest] = decompressed_custom_id.split('.')
    const encoded_data = rest.join('.')

    return { prefix, encoded_data }
  }
}
