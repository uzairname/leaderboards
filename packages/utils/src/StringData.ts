export interface StringDataSchema {
  [k: string]: Field<any>
}
export type AnyStringDataSchema = any

export namespace field {
  export function Enum<T extends { [key: string]: unknown }>(options: T) {
    return new EnumField<T>(options)
  }
  export function Choice<T extends { [key: string]: unknown }>(options: T) {
    return new ChoiceField<T>(options)
  }
  export function ListValue<T>(options: T[]) {
    return new ListValueField(options)
  }
  export function Array<T>(field: Field<T>) {
    return new ArrayField<T>(field)
  }
  export function String() {
    return new StringField()
  }
  export function Int() {
    return new IntegerField()
  }
  export function Float(precision?: number) {
    return new FloatField(precision)
  }
  export function Boolean() {
    return new BooleanField()
  }
  export function Date() {
    return new DateField()
  }
  export function Object<TSchema extends StringDataSchema>(schema: TSchema) {
    return new StringDataDataField<TSchema>(schema)
  }
  export function StringData<TSchema extends StringDataSchema>(schema: TSchema) {
    return new StringDataField<TSchema>(schema)
  }
}

abstract class Field<Type> {
  type = null as Type
  abstract compress(value: Type): string
  abstract decompress(compressed: string): Type
}

class EnumField<T extends { [key: string]: unknown }> extends Field<keyof T> {
  private id_keys = {} as { [key: string]: keyof T }
  private key_ids = {} as { [K in keyof T]: string }
  constructor(private keys: T) {
    super()
    let i = 0
    for (const key in keys) {
      const key_id = i.toString(36)
      this.id_keys[key_id] = key
      this.key_ids[key] = key_id
      i++
    }
  }
  compress(key: keyof T) {
    if (!this.keys.hasOwnProperty(key)) throw new Error(`Option ${key.toString()} doesn't exist`)
    return this.key_ids[key]
  }
  decompress = (value: string) => this.id_keys[value]
}

class ChoiceField<T extends { [key: string]: any }> extends Field<T[keyof T]> {
  private id_keys = {} as { [key: string]: keyof T }
  private key_ids = {} as { [K in keyof T]: string }
  constructor(private values: T) {
    super()
    let i = 0
    for (const key in values) {
      const value_id = i.toString(36)
      this.id_keys[value_id] = key
      this.key_ids[key] = value_id
      i++
    }
  }
  compress(value: T[keyof T]) {
    const matching = Object.entries(this.values).filter(([k, v]) => v == value)
    if (matching.length != 1) throw new Error(`No unique key with value "${value.toString()}"`)
    return this.key_ids[matching[0][0]]
  }
  decompress = (value: string) => this.values[this.id_keys[value]]
}

class ListValueField<T> extends Field<T> {
  constructor(private values: T[]) {
    super()
  }
  compress(value: T) {
    const index = this.values.indexOf(value)
    if (index === -1) throw new Error(`Value ${value} doesn't exist`)
    return index.toString(36)
  }
  decompress = (value: string) => this.values[parseInt(value, 36)]
}

class ArrayField<T> extends Field<NonNullable<T>[]> {
  constructor(private field: Field<T>) {
    super()
  }
  compress = (value: NonNullable<T>[]) => arrayToString(value.map(v => this.field.compress(v)))
  decompress = (compressed: string) =>
    stringToArray(compressed).map(v => nonNullable(this.field.decompress(v), 'decompressed list element'))
}

export class StringField extends Field<string | undefined> {
  compress = (value: string) => value
  decompress = (value: string) => value
}

class IntegerField extends Field<number | undefined> {
  compress = (value: number) => value.toString(36)
  decompress = (value: string) => parseInt(value, 36)
}

class FloatField extends Field<number | undefined> {
  constructor(private precision: number = 4) {
    super()
  }
  compress = (value: number) => value.toPrecision(this.precision)
  decompress = (value: string) => parseFloat(value)
}

class BooleanField extends Field<boolean | undefined> {
  compress = (value: boolean) => (value ? 't' : '')
  decompress = (value: string) => value === 't'
}

class DateField extends Field<Date | undefined> {
  compress = (value: Date) => (Math.floor(value.getTime() / 1000) - 1735707600).toString(36)
  decompress = (value: string) => new Date((parseInt(value, 36) + 1735707600) * 1000)
  // 1735707600 is the unix timestamp of 1/1/2025.
}

class StringDataDataField<TSchema extends StringDataSchema> extends Field<StringData<TSchema>['data']> {
  constructor(private schema: TSchema) {
    super()
  }
  compress = (value: StringData<TSchema>['data']) => new StringData(this.schema).saveAll(value).encode()
  decompress = (value: string) => new StringData(this.schema, value).data
}

class StringDataField<TSchema extends StringDataSchema> extends Field<StringData<TSchema>> {
  constructor(private schema: TSchema) {
    super()
  }
  compress = (value: StringData<TSchema>) => value.encode()
  decompress = (value: string) => new StringData(this.schema, value)
}

export class StringData<TSchema extends StringDataSchema> {
  readonly data = {} as { [K in keyof TSchema]?: TSchema[K]['type'] }

  get = {} as {
    [K in keyof TSchema]: () => NonNullable<TSchema[K]['type']>
  }

  is = {} as {
    [K in keyof TSchema]: (value?: TSchema[K]['type'] | null) => boolean
  }

  save = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['type'] | null | undefined) => this
  }

  saveAll(data: { [K in keyof TSchema]?: TSchema[K]['type'] | null }): this {
    Object.entries(data).forEach(([key, value]) => {
      if (!this.save[key]) return
      value !== undefined && this.save[key](value)
    })
    return this
  }

  set = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['type'] | null | undefined) => StringData<TSchema>
  }

  setAll(data: { [K in keyof TSchema]?: TSchema[K]['type'] | null }): StringData<TSchema> {
    return this.copy().saveAll(data)
  }

  copy(): StringData<TSchema> {
    return new StringData(this.fields, this.encode())
  }

  encode(): string {
    let i = 0
    let defined_fields = 0
    const data_list: string[] = []
    Object.keys(this.fields).forEach(key => {
      if (this.data[key] !== undefined) {
        defined_fields |= 1 << i
        data_list.push(this.fields[key].compress(this.data[key]))
      }
      i++
    })
    const encoded_defined_fields = (
      (1 << Object.keys(this.fields).length) -
      1 -
      parseInt(
        defined_fields.toString(2).padStart(Object.keys(this.fields).length, '0').split('').reverse().join(''),
        2,
      )
    ).toString(36)
    const data_str = arrayToString([encoded_defined_fields].concat(data_list))
    return data_str
  }

  decode(encoded_str: string): this {
    const [encoded_defined_fields, ...compressed_field_values] = stringToArray(encoded_str)
    const defined_fields = parseInt(
      ((1 << Object.keys(this.fields).length) - 1 - parseInt(encoded_defined_fields, 36))
        .toString(2)
        .split('')
        .reverse()
        .join('')
        .padEnd(Object.keys(this.fields).length, '0'),
      2,
    )
    let i = 0
    for (const compressed_field_value of compressed_field_values) {
      while (0 == (defined_fields & (1 << i))) {
        i++
      }
      const key = Object.keys(this.fields)[i] as keyof TSchema
      this.data[key] = this.fields[key].decompress(compressed_field_value)
      i++
    }
    return this
  }

  constructor(
    protected fields: TSchema,
    encoded_str?: string,
  ) {
    for (const key in this.fields) {
      this.save[key] = value => {
        value === undefined || value === null || (typeof value == 'number' && isNaN(value))
          ? delete this.data[key]
          : (this.data[key] = this.validateKeyValue(key, value))
        return this
      }

      this.set[key] = value => this.copy().save[key](value)

      this.get[key] = () => {
        if (this.data[key] === null || this.data[key] === undefined)
          throw new Error(`Field ${key.toString()} is null or undefined`)
        return this.data[key] as NonNullable<TSchema[typeof key]['type']>
      }

      this.is[key] = compare => (compare ? this.data[key] === this.validateKeyValue(key, compare) : !!this.data[key])
    }

    if (encoded_str) {
      this.decode(encoded_str)
    }
  }

  private validateKeyValue(key: keyof TSchema, value: TSchema[typeof key]['type']): typeof value {
    if (!this.fields.hasOwnProperty(key)) throw new Error(`Field ${key.toString()} does not exist in this StringData`)
    if (
      this.fields[key].compress(value) !==
      this.fields[key].compress(this.fields[key].decompress(this.fields[key].compress(value)))
    )
      throw new Error(`Invalid type "${typeof value}" for field ${key.toString()}`)
    return value
  }
}

function stringToArray(str: string) {
  if (str.length == 0) return []
  str = shiftString(str, -array_encode_shift)
  const r = new RegExp(`${escape_char}(${delimiter}|${escape_char})`, 'g')

  const delim_indexes_ignore: number[] = []
  let match: RegExpExecArray | null
  while ((match = r.exec(str))) {
    delim_indexes_ignore.push(match.index + escape_char.length)
  }

  function unescapeString(str: string): string {
    return str.replace(r, (match, p1) => p1)
  }

  const r2 = new RegExp(`${delimiter}`, 'g')
  let field_compressed_values: string[] = []
  let start_index = 0
  while ((match = r2.exec(str + delimiter))) {
    if (delim_indexes_ignore.includes(match.index)) continue

    field_compressed_values.push(unescapeString(str.substring(start_index, match.index)))
    start_index = match.index + delimiter.length
  }

  return field_compressed_values
}

function arrayToString(array: string[]) {
  const regex = new RegExp(`${delimiter}|${escape_char}`, 'g')
  const res = array
    .map(s => {
      return s.replace(regex, match => escape_char + match)
    })
    .join(delimiter)
  return shiftString(res, array_encode_shift)
}

const delimiter = 'q'
const escape_char = 'z'
const array_encode_shift = 1

function shiftString(str: string, shift: number): string {
  return str
    .split('')
    .map(char => String.fromCharCode((char.charCodeAt(0) + shift) % 65536))
    .join('')
}

function nonNullable<T>(value: T, value_name?: string): NonNullable<T> {
  if (value === null || value === undefined) throw new Error(`${value_name || 'value'} is null or undefined`)
  return value
}
