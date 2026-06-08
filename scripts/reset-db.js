"use strict";

/**
 * ⚠️ APAGA TODOS OS DADOS do banco configurado (DROP SCHEMA public CASCADE).
 * Proteção: só roda com CONFIRM_RESET=yes para evitar execução acidental.
 *
 * Uso (no servidor / container da API, onde as variáveis de produção existem):
 *   CONFIRM_RESET=yes npm run db:reset
 *
 * O `db:reset` faz: reset-db.js  →  migrations  →  seed do admin.
 */

const { sequelize } = require("../src/models");

async function main() {
  if (process.env.CONFIRM_RESET !== "yes") {
    console.error(
      "RECUSADO: este comando APAGA TODOS OS DADOS. Para confirmar, rode com CONFIRM_RESET=yes."
    );
    process.exit(1);
  }

  const { database, host } = sequelize.config;
  console.warn(`==> ⚠️  Apagando TODOS os dados de "${database}" em "${host}"...`);

  await sequelize.query("DROP SCHEMA IF EXISTS public CASCADE;");
  await sequelize.query("CREATE SCHEMA public;");
  await sequelize.query("GRANT ALL ON SCHEMA public TO public;").catch(() => {});

  console.warn("==> Schema 'public' recriado vazio.");
  await sequelize.close();
  console.warn("==> Banco zerado. Agora rodam as migrations e o seed do admin.");
}

main().catch((err) => {
  console.error("Falha no reset:", err.message);
  process.exit(1);
});
