import pg from "pg";
import fastcsv from "fast-csv";
import fs from "fs";
import dotenv from "dotenv";


// download all tables from database as csv files

dotenv.config();


async function download() {

    const pool = new pg.Pool({
        connectionString: process.env.POSTGRES_URL_PRODUCTION_OLD,
        ssl: true
    });

    const client = await pool.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';");
    const tables = res.rows.map(row => row.table_name);

    console.log(tables);

    for (const table of tables) {
        const res = await client.query(`SELECT * FROM "${table}";`);
        const rows = res.rows;
        // create csv file if not exists
        const ws = fs.createWriteStream(`temp_data/${table}.csv`);
        fastcsv.write(rows, { headers: true }).pipe(ws);
    }
}


async function transfer() {
    const pool = new pg.Pool({
        connectionString: process.env.POSTGRES_URL_PRODUCTION,
        ssl: true
    });

    const client = await pool.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';");

}

download().then(() => {
    console.log("done");
    process.exit(0);
})

