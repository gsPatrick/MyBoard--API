const { execFile } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../../");

/**
 * Roda as migrations pendentes no boot da API, para que `node app.js`
 * (dev, sem o docker-entrypoint) sempre suba com o schema atualizado.
 * Não derruba a aplicação em caso de falha — apenas registra o erro.
 */
function runMigrations() {
  return new Promise((resolve) => {
    const bin = path.resolve(PROJECT_ROOT, "node_modules/.bin/sequelize-cli");

    console.log("==> Verificando migrations pendentes...");
    execFile(bin, ["db:migrate"], { cwd: PROJECT_ROOT }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (error) {
        console.error("[migrations] Falha ao rodar migrations:", error.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

module.exports = { runMigrations };
