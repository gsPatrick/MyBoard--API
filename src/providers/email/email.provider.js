async function sendMail({ to, subject, text }) {
  const nodemailer = require("nodemailer");

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });

  return { queued: true };
}

module.exports = {
  async sendPasswordResetEmail({ to, name, token }) {
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const resetUrl = `${appUrl.replace(/\/$/, "")}/reset-password?token=${token}`;

    const subject = "Redefinição de senha — MyBoard";
    const text = `Olá ${name},\n\nUse o link para redefinir sua senha:\n${resetUrl}\n\nOu use o token: ${token}\n\nEste link expira em 1 hora.`;

    if (process.env.SMTP_HOST) {
      return sendMail({ to, subject, text });
    }

    console.log("[email:password-reset]", { to, resetUrl, token });
    return { queued: false, logged: true };
  },

  sendMail,
};
