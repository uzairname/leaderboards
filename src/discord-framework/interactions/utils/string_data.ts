abstract class Field<T> {
  default_value: T
  constructor(value: T) {
    this.default_value = value
  }
  abstract compress(value: T): string[]
  abstract decompress(compressed: string[]): T
}

export type StringDataSchema = {
  [key: string]: Field<unknown>
}

const item_delimiter = 'q'
const field_delimiter = 'j'
const escape_char = 'z'

function encodeString(value: string): string {
  return value.replace(/[zqj]/g, (match) => escape_char + match)
}
function decodeString(str: string): string {
  return str.replace(/z([zqj])/g, (match, p1) => p1)
}

export class StringData<T extends StringDataSchema> {
  save = {} as {
    [K in keyof T]: (value: T[K]['default_value']) => this
  }
  // returns this with the new value, saving new value.
  set = {} as {
    [K in keyof T]: (value: T[K]['default_value']) => StringData<T>
  }
  // returns a new StringData with the new value, without modifying the original.
  data = {} as Partial<{
    [K in keyof T]: T[K]['default_value']
  }>
  // the value of the field.
  is = {} as {
    [K in keyof T]: (value: T[K]['default_value']) => boolean
  }
  // returns true if the field's value is equal to the given value.

  private schema: T

  private key_to_keyid = {} as {
    [K in Extract<keyof T, string>]: string
  }

  private keyid_to_key = {} as {
    [id: string]: string
  }

  constructor(structure: T) {
    this.schema = structure
    for (const key in this.schema) {
      this.data[key] = this.schema[key].default_value

      this.save[key] = (value: T[typeof key]['default_value']) => {
        this.data[key] = this.validateAndCompress(key, value)
        return this
      }

      this.set[key] = (value: T[typeof key]['default_value']) => {
        let temp = new StringData(this.schema)
        temp.data = {
          ...this.data,
        }
        temp.data[key] = this.validateAndCompress(key, value)
        return temp
      }

      this.is[key] = (value: T[typeof key]['default_value']) => {
        return this.data[key] === this.validateAndCompress(key, value)
      }
    }

    let i = 0
    for (const key in this.schema) {
      const keyid = i.toString(36)
      this.key_to_keyid[key] = keyid
      this.keyid_to_key[keyid] = key
      i++
    }
  }

  private validateAndCompress(key: string, value: unknown): unknown {
    if (!this.schema.hasOwnProperty(key)) throw new Error('Key does not exist')
    const field = this.schema[key]
    field.compress(value)
    return value
  }

  encode(): string {
    let encoded_str = ''
    for (const key in this.data) {
      if (this.data[key] !== undefined) {
        const encoded = this.schema[key]
          .compress(this.data[key])
          .map((v) => encodeString(v))
          .join(item_delimiter)
        encoded_str +=
          encodeString(this.key_to_keyid[key]) + item_delimiter + encoded + field_delimiter
      }
    }
    return encoded_str
  }

  decode(encoded_str: string): this {
    let r = /z([zqj])/g
    const delim_indexes_ignore: number[] = []
    let match: RegExpExecArray | null
    while ((match = r.exec(encoded_str)) !== null) {
      delim_indexes_ignore.push(match.index + 1)
    }

    r = /j|q/g
    let field_lists: string[][] = []
    let current_field: string[] = []
    let start_index = 0
    while ((match = r.exec(encoded_str)) !== null) {
      if (delim_indexes_ignore.includes(match.index)) continue
      current_field.push(decodeString(encoded_str.substring(start_index, match.index)))
      start_index = match.index + 1
      if (match[0] === field_delimiter) {
        field_lists.push(current_field)
        current_field = []
      }
    }

    for (const field_list of field_lists) {
      const [keyid, ...value] = field_list
      let key = this.keyid_to_key[decodeString(keyid)]
      const field = this.schema[key] // key: [K in keyof T]
      if (!field) throw new Error(`Invalid encoded string ${encoded_str}`)
      const validKey = key as keyof T

      this.data[validKey] = field.decompress(value)
    }
    return this
  }
}

export class StringField extends Field<string | undefined> {
  constructor(default_value?: string) {
    super(default_value)
  }
  compress(value: string) {
    return [value]
  }

  decompress(value: string[]) {
    return value[0]
  }
}

export class NumberField extends Field<number | undefined> {
  constructor(default_value?: number) {
    super(default_value)
  }

  compress(value: number) {
    return [value.toString()]
  }

  decompress(value: string[]) {
    return parseInt(value[0])
  }
}

export class ChoiceField<
  T extends {
    [key: string]: unknown
  },
> extends Field<keyof T | undefined> {
  options: T

  option_id_to_option = {} as {
    [key: string]: keyof T
  }
  option_to_option_id = {} as {
    [K in keyof T]: string
  }

  constructor(options: T, default_option?: keyof T) {
    super(default_option)
    this.options = options

    let i = 0
    for (const option in options) {
      if (options.hasOwnProperty(option)) {
        const optionid = i.toString(36)
        this.option_id_to_option[optionid] = option
        this.option_to_option_id[option] = optionid
        i++
      }
    }
  }

  compress(option: keyof T) {
    if (!this.options.hasOwnProperty(option))
      throw new Error(`Option ${option.toString()} does not exist`)
    return [this.option_to_option_id[option]]
  }

  decompress(option_id: string[]) {
    return this.option_id_to_option[option_id[0]]
  }
}

export class ListField extends Field<string[] | undefined> {
  constructor(default_value?: string[]) {
    super(default_value)
  }

  compress(value: string[]) {
    return value
  }

  decompress(value: string[]) {
    return value
  }
}
