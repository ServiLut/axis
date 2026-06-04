import 'dotenv/config';
import mysql from 'mysql2/promise';

async function run() {
  try {
    const url = new URL(process.env.DATABASE_URL_MYSQL!);
    const connection = await mysql.createConnection({
      host: url.hostname,
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      port: parseInt(url.port) || 3306,
    });

    const [tables] = await connection.query('SHOW TABLES');
    console.log('MySQL Tables:', tables);

    await connection.end();
  } catch (error) {
    console.error('MySQL Error:', error);
  }
}

run();
