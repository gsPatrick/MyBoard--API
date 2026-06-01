const fs = require("fs");
const path = require("path");

const PROMPTS_ROOT = path.join(__dirname, "prompts");

function loadPrompt(relativePath) {
  const filePath = path.join(PROMPTS_ROOT, `${relativePath}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt não encontrado: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8").trim();
}

function composeSystemPrompt(parts = []) {
  return parts
    .map((part) => (part.includes("\n") ? part : loadPrompt(part)))
    .filter(Boolean)
    .join("\n\n---\n\n");
}

module.exports = {
  loadPrompt,
  composeSystemPrompt,
};
