const multer = require("multer");
const AppError = require("../utils/app-error");
const { ALLOWED_MIME_TYPES } = require("../config/constants");

const MAX_FILE_SIZE = Number(process.env.UPLOAD_MAX_SIZE_MB || 25) * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError("Tipo de arquivo não permitido", 400, "INVALID_MIME_TYPE"));
    }
  },
});

module.exports = upload;
