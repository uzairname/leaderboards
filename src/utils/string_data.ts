import { nonNullable } from './utils'

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

type x = Exclude<string, 'all'>

const item_delimiter = 'q'
const field_delimiter = 'j'
const escape_char = 'z'

function encodeString(value: string): string {
  return value.replace(/[zqj]/g, match => escape_char + match)
}
function decodeString(str: string): string {
  return str.replace(/z([zqj])/g, (match, p1) => p1)
}

export class StringDataError extends Error {}

export class StringData<TSchema extends StringDataSchema> {
  // returns this with the new value, saving new value.
  save = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['default_value']) => this
  }
  // returns a new StringData with the new value, without modifying the original.
  set = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['default_value']) => StringData<TSchema>
  }
  // the value of the field.
  data = {} as Partial<{
    [K in keyof TSchema]: TSchema[K]['default_value']
  }>
  // the non nullable value of the field
  get<K extends keyof TSchema>(key: K): NonNullable<TSchema[K]['default_value']> {
    return nonNullable(this.data[key], key.toString())
  }

  // returns true if the field's value is equal to the given value.
  is = {} as {
    [K in keyof TSchema]: TSchema[K] extends BooleanField
      ? () => boolean
      : (value: TSchema[K]['default_value']) => boolean
  }

  setAll(
    data: Partial<{ [K in keyof TSchema]: TSchema[K]['default_value'] }>
  ): StringData<TSchema> {
    let temp = new StringData(this.schema)
    temp.data = Object.entries(data).reduce((acc, [key, value]) => {
      value !== undefined ? (acc[key] = this.validateAndCompress(key, value)) : null
      return acc
    }, {} as any)
    return temp
  }

  saveAll(data: Partial<{ [K in keyof TSchema]: TSchema[K]['default_value'] }>): void {
    for (const [key, value] of Object.entries(data)) {
      this.save[key](value)
    }
  }

  protected schema: TSchema

  private key_to_keyid = {} as {
    [K in Extract<keyof TSchema, string>]: string
  }

  private keyid_to_key = {} as {
    [id: string]: string
  }

  constructor(structure: TSchema, encoded_str?: string) {
    this.schema = structure
    for (const key in this.schema) {
      this.data[key] = this.schema[key].default_value

      this.save[key] = (value: TSchema[typeof key]['default_value']) => {
        value !== undefined
          ? (this.data[key] = this.validateAndCompress(key, value))
          : delete this.data[key]
        return this
      }

      this.set[key] = (value: TSchema[typeof key]['default_value']) => {
        let temp = new StringData(this.schema)
        temp.data = {
          ...this.data
        }
        temp.save[key](value)
        return temp
      }

      this.is[key] = ((value: TSchema[typeof key]['default_value']) => {
        if (this.schema[key] instanceof BooleanField) {
          return this.data[key] === true
        }
        return this.data[key] === this.validateAndCompress(key, value)
      }) as any
    }

    let i = 0
    for (const key in this.schema) {
      const keyid = i.toString(36)
      this.key_to_keyid[key] = keyid
      this.keyid_to_key[keyid] = key
      i++
    }

    if (encoded_str) {
      this.decode(encoded_str)
    }
  }

  protected validateAndCompress(key: string, value: unknown): unknown {
    if (!this.schema.hasOwnProperty(key))
      throw new StringDataError(`Field ${key} does not exist on schema`)
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
          .map(v => encodeString(v))
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
      if (!field) throw new StringDataError(`Invalid encoded string ${encoded_str}`)
      const validKey = key as keyof TSchema

      this.data[validKey] = field.decompress(value)
    }
    return this
  }
}

export class ChoiceField<T extends { [key: string]: unknown }> extends Field<keyof T | undefined> {
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
      throw new StringDataError(`Option ${option.toString()} does not exist in choice field`)
    return [this.option_to_option_id[option]]
  }

  decompress(option_id: string[]) {
    return this.option_id_to_option[option_id[0]]
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

export class IntField extends Field<number | undefined> {
  constructor(default_value?: number) {
    super(default_value)
  }

  compress(value: number) {
    return [value.toString(36)]
  }

  decompress(value: string[]) {
    return parseInt(value[0], 36)
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

export class BooleanField extends Field<boolean | undefined> {
  constructor(default_value?: undefined) {
    super(default_value)
  }

  compress(value: boolean) {
    return [value ? 'a' : '']
  }

  decompress(value: string[]) {
    return value[0] === 'a'
  }
}

export class TimestampField extends Field<Date | undefined> {
  constructor(default_value?: Date) {
    super(default_value)
  }

  compress(value: Date) {
    return [(Math.floor(value.getTime() / 1000) - 1735707600).toString(36)]
    // 1735707600 is the unix timestamp of 2025-01-01. This saves like 4 bits.
  }

  decompress(value: string[]) {
    return new Date((parseInt(value[0], 36) + 1735707600) * 1000)
  }
}
