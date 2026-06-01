const { createHash } = require("crypto");

function hashContent(text) {
  return createHash("sha256").update(String(text || "").trim()).digest("hex");
}

module.exports = { hashContent };
