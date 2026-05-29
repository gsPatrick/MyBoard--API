const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const AppError = require("../../utils/app-error");

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const PUBLIC_BASE_URL = process.env.UPLOAD_PUBLIC_BASE_URL || "";

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function buildPublicUrl(relativePath) {
  if (!PUBLIC_BASE_URL) return null;
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

async function saveLocalFile({ file, entityType, entityId, kind }) {
  const ext = path.extname(file.originalname) || "";
  const storedName = `${randomUUID()}${ext}`;
  const relativePath = path.join(entityType, entityId, storedName);
  const absolutePath = path.join(UPLOAD_ROOT, relativePath);

  await ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, file.buffer);

  return {
    storage_disk: "local",
    storage_path: relativePath.replace(/\\/g, "/"),
    stored_name: storedName,
    public_url: buildPublicUrl(relativePath.replace(/\\/g, "/")),
  };
}

async function deleteLocalFile(storagePath) {
  if (!storagePath) return;
  const absolutePath = path.join(UPLOAD_ROOT, storagePath);
  try {
    await fs.unlink(absolutePath);
  } catch {
    // arquivo já removido
  }
}

function resolveAbsolutePath(storagePath) {
  return path.join(UPLOAD_ROOT, storagePath);
}

module.exports = {
  UPLOAD_ROOT,
  saveLocalFile,
  deleteLocalFile,
  resolveAbsolutePath,
};
