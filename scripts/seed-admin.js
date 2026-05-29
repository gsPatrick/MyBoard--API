require("dotenv").config();
const bcrypt = require("bcryptjs");
const { User, sequelize } = require("../src/models");

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "patrickgsiqueira@hotmail.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "patrick123";
  const name = process.env.SEED_ADMIN_NAME || "Patrick Gomes";

  await sequelize.authenticate();

  const existing = await User.findOne({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 10);

  if (!existing) {
    await User.create({
      name,
      email,
      password_hash: passwordHash,
      role: "admin",
      is_active: true,
      is_hidden: false,
    });
    console.log(`Usuário admin criado: ${email}`);
    return;
  }

  if (!existing.password_hash) {
    await existing.update({ password_hash: passwordHash, role: "admin" });
    console.log(`Senha do admin atualizada: ${email}`);
    return;
  }

  console.log(`Usuário admin já existe: ${email}`);
}

seedAdmin()
  .then(() => sequelize.close())
  .catch((error) => {
    console.error("Erro ao criar admin:", error.message);
    process.exit(1);
  });
