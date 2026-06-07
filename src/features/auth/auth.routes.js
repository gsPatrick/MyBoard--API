const { Router } = require("express");
const authController = require("./auth.controller");
const authenticate = require("../../middlewares/authenticate");

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authenticate, authController.me);
router.post("/refresh", authenticate, authController.refresh);
router.patch("/me", authenticate, authController.updateProfile);
router.patch("/onboarding", authenticate, authController.updateOnboarding);
router.post("/change-password", authenticate, authController.changePassword);

// Passkeys / WebAuthn
router.post("/passkey/login/options", authController.passkeyLoginOptions);
router.post("/passkey/login/verify", authController.passkeyLoginVerify);
router.post("/passkey/register/options", authenticate, authController.passkeyRegisterOptions);
router.post("/passkey/register/verify", authenticate, authController.passkeyRegisterVerify);
router.get("/passkey", authenticate, authController.passkeyList);
router.delete("/passkey/:id", authenticate, authController.passkeyDelete);

module.exports = router;
