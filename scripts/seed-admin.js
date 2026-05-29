require("dotenv").config();
const bcrypt = require("bcryptjs");
const { User, sequelize } = require("../src/models");

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "patrickgsiqueira@hotmail.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "patrick123";
  const name = process.env.SEED_ADMIN_NAME || "Patrick Gomes";

  await sequelize.authenticate();

  const existing = await User.scope("withPassword").findOne({
    where: { email, tenant_id: null },
  });
  const passwordHash = await bcrypt.hash(password, 10);

  if (!existing) {
    await User.create({
      tenant_id: null,
      name,
      email,
      password_hash: passwordHash,
      role: "super_admin",
      is_active: true,
      is_hidden: false,
    });
    console.log(`Super admin criado: ${email}`);
    return;
  }

  await existing.update({
    password_hash: passwordHash,
    role: "super_admin",
    tenant_id: null,
    is_active: true,
  });
  console.log(`Super admin atualizado: ${email}`);
}

seedAdmin()
  .then(() => sequelize.close())
  .catch((error) => {
    console.error("Erro ao criar admin:", error.message);
    process.exit(1);
  });
