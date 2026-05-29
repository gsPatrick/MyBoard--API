require("dotenv").config();
const { Client } = require("pg");

async function tryConnect(config) {
  const client = new Client(config);
  await client.connect();
  return client;
}

async function createDatabase() {
  const dbName = process.env.DB_NAME || "myboard";
  const baseConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "myboard",
    password: process.env.DB_PASSWORD || "myboard",
  };

  const maintenanceDb = process.env.DB_MAINTENANCE_DATABASE || "postgres";

  try {
    const client = await tryConnect({ ...baseConfig, database: maintenanceDb });

    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Banco "${dbName}" criado.`);
    } else {
      console.log(`Banco "${dbName}" já existe.`);
    }

    await client.end();
    return;
  } catch (error) {
    console.warn(`Não foi possível usar DB de manutenção "${maintenanceDb}": ${error.message}`);
  }

  try {
    const client = await tryConnect({ ...baseConfig, database: dbName });
    await client.query("SELECT 1");
    console.log(`Banco "${dbName}" acessível e pronto.`);
    await client.end();
  } catch (error) {
    console.error(`Erro ao conectar no banco "${dbName}":`, error.message);
    process.exit(1);
  }
}

createDatabase().catch((error) => {
  console.error("Erro ao preparar banco:", error.message);
  process.exit(1);
});
