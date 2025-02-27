const mysql = require('mysql');

require("dotenv").config({ path: "../.env" });

console.log(process.env.DB_PASSWORD)

const DB_HOSTNAME="localhost"
const DB_USERNAME="root"
const DB_PASSWORD="123456"
const DB_DATABASE="youtube"

// ----------- DB --------------
const sql = mysql.createPool({
    host: DB_HOSTNAME,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    debug: false
})

sql.getConnection((err, connection) => {
    if (err) {
        console.log(err)
        process.exit(-1)
    } else {
        console.log('Database connected successfully');
        connection.release();
    }
})

module.exports = { sql }