require("dotenv").config();
const { User, sequelize } = require("../src/models");
const authService = require("../src/features/auth/auth.service");

/**
 * Cria uma conta comum (workspace próprio + usuário admin do workspace),
 * do mesmo jeito que o cadastro pelo site. Idempotente: se o e-mail já
 * existir, não faz nada (não sobrescreve a senha trocada pelo app).
 *
 * Variáveis: SEED_USER_EMAIL, SEED_USER_PASSWORD, SEED_USER_NAME, SEED_USER_COMPANY
 */
async function seedUser() {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    console.log("Seed de usuário: SEED_USER_EMAIL/SEED_USER_PASSWORD não definidos, pulando.");
    return;
  }

  const name = process.env.SEED_USER_NAME?.trim() || email.split("@")[0];
  const companyName = process.env.SEED_USER_COMPANY?.trim() || name;

  await sequelize.authenticate();

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    console.log(`Seed de usuário: ${email} já existe, nada a fazer.`);
    return;
  }

  await authService.register({ name, email, password, company_name: companyName });
  console.log(`Seed de usuário: conta criada para ${email} (workspace "${companyName}").`);
}

seedUser()
  .then(() => sequelize.close())
  .catch((error) => {
    console.error("Erro ao criar usuário:", error.message);
    process.exit(1);
  });
