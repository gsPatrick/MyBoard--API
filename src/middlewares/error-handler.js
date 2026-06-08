const AppError = require("../utils/app-error");

function errorHandler(err, req, res, _next) {
  // Loga TODO erro (antes só o 500 era logado) — facilita acompanhar no terminal.
  const where = `${req.method} ${req.originalUrl}`;
  if (err instanceof AppError) {
    console.warn(
      `[error] ${where} → ${err.statusCode} ${err.code || "APP_ERROR"}: ${err.message}` +
        (err.details ? ` | details: ${JSON.stringify(err.details).slice(0, 300)}` : "")
    );
  } else {
    console.error(`[error] ${where} → ${err.name || "Error"}: ${err.message}`);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      success: false,
      error: {
        message: "Erro de validação",
        code: "VALIDATION_ERROR",
        details: err.errors.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      },
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      success: false,
      error: {
        message: "Registro duplicado",
        code: "DUPLICATE_ERROR",
        details: err.errors?.map((e) => ({
          field: e.path,
          message: e.message,
        })),
      },
    });
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res.status(400).json({
      success: false,
      error: {
        message: "Referência inválida",
        code: "FOREIGN_KEY_ERROR",
      },
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      error: {
        message: err.code === "LIMIT_FILE_SIZE" ? "Arquivo excede o tamanho máximo" : err.message,
        code: "UPLOAD_ERROR",
      },
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    error: {
      message: "Erro interno do servidor",
      code: "INTERNAL_ERROR",
    },
  });
}

module.exports = errorHandler;
