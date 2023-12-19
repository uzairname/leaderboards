export type StringDataSchema = {
  [key: string]: Field<unknown>
}

export class StringData<TSchema extends StringDataSchema> {
  /**
   * The data contained in this object. Keys are the keys of the schema,
   * values are the values of the schema.
   */
  data = {} as Partial<{
    [K in keyof TSchema]: TSchema[K]['default_value']
  }>

  /**
   * Retrieves the value of a specified key from the data object.
   * Throws an error if the value is null or undefined.
   *
   * @param key The key to retrieve the value of.
   * @returns The value of the specified key.
   * @throws Error if the value is null or undefined.
   */
  get<K extends keyof TSchema>(key: K): NonNullable<TSchema[K]['default_value']> {
    if (this.data[key] === null || this.data[key] === undefined)
      throw new Error(`Field ${key.toString()} is null or undefined`)
    return this.data[key] as NonNullable<TSchema[K]['default_value']>
  }

  /**
   * Represents a set of functions corresponding to each key that
   * can be used to save values in place.
   *
   * @param key The key to save the value of.
   * @param value The value to save.
   * @returns this for chaining.
   */
  save = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['default_value']) => this
  }

  /**
   * Saves the provided data to the string data object.
   *
   * @param data A partial JSON object with keys in the schema and values to save.
   * @returns this for chaining.
   */
  saveData(data: Partial<{ [K in keyof TSchema]: TSchema[K]['default_value'] }>): this {
    for (const [key, value] of Object.entries(data)) {
      this.save[key](value)
    }
    return this
  }

  /**
   * Represents a set of functions corresponding to each key that
   * can be used to set values in a copy of the string data object.
   *
   * @param key The key to set the value of.
   * @param value The value to set.
   * @returns A copy of the string data object.
   */
  set = {} as {
    [K in keyof TSchema]: (value: TSchema[K]['default_value']) => StringData<TSchema>
  }

  /**
   * Sets the provided data to a copy of the string data object.
   * @param data A partial object with keys in the schema and values to set.
   * @returns A copy of the string data object.
   */
  setData(
    data: Partial<{ [K in keyof TSchema]: TSchema[K]['default_value'] }>,
  ): StringData<TSchema> {
    return this.copy().saveData(data)
  }

  /**
   * Represents a set of functions corresponding to each key that
   * can be used to check if a value is equal to the provided value, or truthy.
   *
   * @param key The key to check the value of.
   * @param value The value to check against.
   * @returns A boolean
   */
  is = {} as {
    [K in keyof TSchema]: (value?: TSchema[K]['default_value']) => boolean
  }

  /**
   * Encodes the string data object into a string representation.
   * @returns The encoded string.
   */
  encode(): string {
    let encoded_str = ''
    for (const key in this.data) {
      if (this.data[key] !== undefined) {
        const encoded = this.schema[key]
          .compress(this.data[key])
          .map(v => this.encodeString(v))
          .join(this.item_delimiter)
        encoded_str +=
          this.encodeString(this.key_to_keyid[key]) +
          this.item_delimiter +
          encoded +
          this.field_delimiter
      }
    }
    return encoded_str
  }

  /**
   * Decodes the provided string and saves its values to the string data object.
   *
   * @param encoded_str The string to decode.
   * @returns this for chaining.
   */
  decode(encoded_str: string): this {
    let r = /z([zqj])/g
    const delim_indexes_ignore: number[] = []
    let match: RegExpExecArray | null
    while ((match = r.exec(encoded_str))) {
      delim_indexes_ignore.push(match.index + 1)
    }

    r = /j|q/g
    let field_lists: string[][] = []
    let current_field: string[] = []
    let start_index = 0
    while ((match = r.exec(encoded_str))) {
      if (delim_indexes_ignore.includes(match.index)) continue
      current_field.push(this.decodeString(encoded_str.substring(start_index, match.index)))
      start_index = match.index + 1
      if (match[0] === this.field_delimiter) {
        field_lists.push(current_field)
        current_field = []
      }
    }

    for (const field_list of field_lists) {
      const [keyid, ...value] = field_list
      let key = this.keyid_to_key[this.decodeString(keyid)]
      const field = this.schema[key]
      if (!field) throw new StringDataError(`Invalid encoded string ${encoded_str}`)
      const validKey = key as keyof TSchema

      this.data[validKey] = field.decompress(value)
    }
    return this
  }

  constructor(
    protected schema: TSchema,
    encoded_str?: string,
  ) {
    let i = 0
    for (const key in this.schema) {
      const keyid = i.toString(36)
      this.key_to_keyid[key] = keyid
      this.keyid_to_key[keyid] = key
      i++

      this.data[key] = this.schema[key].default_value

      this.save[key] = (value: TSchema[typeof key]['default_value']) => {
        value === undefined || JSON.parse(JSON.stringify(value)) === null // for NaN values
          ? delete this.data[key]
          : (this.data[key] = this.validateKeyValue(key, value))
        return this
      }

      this.set[key] = (value: TSchema[typeof key]['default_value']) => this.copy().save[key](value)

      this.is[key] = (value?: TSchema[typeof key]['default_value']) =>
        value ? this.data[key] === this.validateKeyValue(key, value) : !!this.data[key]
    }
    if (encoded_str) {
      this.decode(encoded_str)
    }
  }

  protected copy(): StringData<TSchema> {
    let temp = new StringData(this.schema)
    temp.data = {
      ...this.data,
    }
    return temp
  }

  private key_to_keyid = {} as {
    [K in Extract<keyof TSchema, string>]: string
  }

  private keyid_to_key = {} as {
    [id: string]: string
  }

  private item_delimiter = 'q'
  private field_delimiter = 'j'
  private escape_char = 'z'

  private encodeString(value: string): string {
    return value.replace(/[zqj]/g, match => this.escape_char + match)
  }
  private decodeString(str: string): string {
    return str.replace(/z([zqj])/g, (match, p1) => p1)
  }

  private validateKeyValue<T>(key: string, value: T): T {
    if (!this.schema.hasOwnProperty(key))
      throw new StringDataError(`Field ${key} does not exist on schema`)
    return this.schema[key].decompress(this.schema[key].compress(value)) as T
  }
}

export class StringDataError extends Error {}

abstract class Field<T> {
  constructor(public default_value?: T) {}
  abstract compress(value: T): string[]
  abstract decompress(compressed: string[]): T
}

class ChoiceField<T extends { [key: string]: null }> extends Field<keyof T | undefined> {
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

class ListField<T> extends Field<T[] | undefined> {
  constructor(
    private field: Field<T>,
    default_value?: T[],
  ) {
    super(default_value)
  }

  compress(value: T[]): string[] {
    return value.map(v => this.field.compress(v)).flat()
  }

  decompress(value: string[]): T[] {
    return value.map(v => this.field.decompress([v]))
  }
}

class StringField extends Field<string | undefined> {
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

class IntegerField extends Field<number | undefined> {
  constructor(default_value?: number) {
    super(default_value)
  }

  compress(value: number) {
    if (isNaN(value)) return [''] // decompress(['']) returns NaN
    return [value.toString(36)]
  }

  decompress(value: string[]) {
    return parseInt(value[0], 36)
  }
}

class FloatField extends Field<number | undefined> {
  constructor(
    private precision: number = 4,
    default_value?: number,
  ) {
    super(default_value)
  }

  compress(value: number) {
    if (isNaN(value)) return [''] // decompress(['']) returns NaN
    return [value.toPrecision(this.precision)]
  }

  decompress(value: string[]) {
    return parseFloat(value[0])
  }
}

class BooleanField extends Field<boolean | undefined> {
  compress(value: boolean) {
    return [value ? 'a' : '']
  }

  decompress(value: string[]) {
    return value[0] === 'a'
  }
}

class DateField extends Field<Date | undefined> {
  constructor(default_value?: Date) {
    super(default_value)
  }

  compress(value: Date) {
    return [(Math.floor(value.getTime() / 1000) - 1735707600).toString(36)]
    // 1735707600 is the unix timestamp of 2025-01-01. This saves like 4 bits if the date is around today.
  }

  decompress(value: string[]) {
    return new Date((parseInt(value[0], 36) + 1735707600) * 1000)
  }
}

export namespace field {
  export function Choice<T extends { [key: string]: null }>(options: T, default_option?: keyof T) {
    return new ChoiceField(options, default_option)
  }
  export function List<T>(field: Field<T>, default_value?: T[]) {
    return new ListField(field, default_value)
  }
  export function String(default_value?: string) {
    return new StringField(default_value)
  }
  export function Int(default_value?: number) {
    return new IntegerField(default_value)
  }
  export function Float(precision?: number, default_value?: number) {
    return new FloatField(precision, default_value)
  }
  export function Bool(default_value?: boolean) {
    return new BooleanField(default_value)
  }
  export function Date(default_value?: Date) {
    return new DateField(default_value)
  }
}
