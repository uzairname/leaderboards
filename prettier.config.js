export default {
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'all',
  singleQuote: true,
  semi: false,
  endOfLine: 'crlf',
  arrowParens: 'avoid',
  plugins: ["@trivago/prettier-plugin-sort-imports"],
  importOrderParserPlugins: ["typescript", "decorators-legacy"],
  importOrder: ["^[./]"],
}
