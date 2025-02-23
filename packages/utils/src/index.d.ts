export type StringDataSchema = {
  [k: string]: Field<unknown>
}

export abstract class Field<Type> {
  type: Type
  abstract compress(value: Type): string
  abstract decompress(compressed: string): Type
}

export class EnumField<T extends { [key: string]: unknown }> extends Field<keyof T> {
  constructor(keys: T)
  compress(key: keyof T): string
  decompress(value: string): keyof T
}

export class ChoiceField<T extends { [key: string]: any }> extends Field<T[keyof T]> {
  constructor(values: T)
  compress(value: T[keyof T]): string
  decompress(value: string): T[keyof T]
}

export class ListValueField<T> extends Field<T> {
  constructor(values: T[])
  compress(value: T): string
  decompress(value: string): T
}

export class ArrayField<T> extends Field<NonNullable<T>[]> {
  constructor(field: Field<T>)
  compress(value: NonNullable<T>[]): string
  decompress(compressed: string): NonNullable<T>[]
}

export class StringField extends Field<string | undefined> {
  compress(value: string): string
  decompress(value: string): string
}

export class IntegerField extends Field<number | undefined> {
  compress(value: number): string
  decompress(value: string): number
}

export class FloatField extends Field<number | undefined> {
  constructor(precision?: number)
  compress(value: number): string
  decompress(value: string): number
}

export class BooleanField extends Field<boolean | undefined> {
  compress(value: boolean): string
  decompress(value: string): boolean
}

export class DateField extends Field<Date | undefined> {
  compress(value: Date): string
  decompress(value: string): Date
}

export class StringDataDataField<TSchema extends StringDataSchema> extends Field<StringData<TSchema>['data']> {
  constructor(schema: TSchema)
  compress(value: StringData<TSchema>['data']): string
  decompress(value: string): StringData<TSchema>['data']
}

export class StringDataField<TSchema extends StringDataSchema> extends Field<StringData<TSchema>> {
  constructor(schema: TSchema)
  compress(value: StringData<TSchema>): string
  decompress(value: string): StringData<TSchema>
}

export class StringData<TSchema extends StringDataSchema> {
  data: { [K in keyof TSchema]: ReturnType<TSchema[K]['decompress']> }
  constructor(schema: TSchema, encoded?: string)
  saveAll(data: StringData<TSchema>['data']): this
  encode(): string
}
