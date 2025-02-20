"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var database_1 = require("@repo/database");
// import nonNullable from '@repo/utils'
var dotenv = require("dotenv");
console.log(database_1.migrate_database);
var args = process.argv.slice(2);
var envPath = args.length == 1 ? args[0] : undefined;
dotenv.config({
    path: envPath,
});
// const postgres_url = nonNullable(process.env.POSTGRES_URL, 'postgres url')
(0, database_1.migrate_database)("").then(function () {
    process.exit(0);
}).catch(function (e) {
    console.error(e);
    process.exit(1);
});
