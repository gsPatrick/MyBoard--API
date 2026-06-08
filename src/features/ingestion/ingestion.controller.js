const catchAsync = require("../../middlewares/catch-async");
const { sendSuccess } = require("../../utils/response");
const { buildServiceContext } = require("../../utils/request-context");
const ingestionService = require("./ingestion.service");

const analyze = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);
  const files = req.files || [];
  console.log(
    `[ingestion] analyze: ${files.length} arquivo(s) [${files
      .map((f) => `${f.originalname}(${f.mimetype},${f.size}b)`)
      .join(", ")}] tenant=${ctx.tenantId}`
  );
  const result = await ingestionService.analyze({ files, tenantId: ctx.tenantId });
  console.log(
    `[ingestion] analyze OK: cliente=${result.stats?.has_client} projeto=${result.stats?.has_project} detalhes=${result.stats?.details}`
  );
  return sendSuccess(res, result);
});

const apply = catchAsync(async (req, res) => {
  const ctx = buildServiceContext(req);

  let proposal = {};
  try {
    proposal = JSON.parse(req.body.proposal || "{}");
  } catch {
    proposal = {};
  }

  const target = {};
  if (req.body.target_project_id) target.project_id = req.body.target_project_id;
  if (req.body.target_client_id) target.client_id = req.body.target_client_id;

  console.log(
    `[ingestion] apply: target=${JSON.stringify(target)} proposta(cliente=${Boolean(proposal.client)}, projeto=${Boolean(proposal.project)}, detalhes=${(proposal.details || []).length}) arquivos=${(req.files || []).length}`
  );

  const result = await ingestionService.apply({
    proposal,
    target,
    files: req.files || [],
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    role: ctx.role,
  });

  console.log(
    `[ingestion] apply OK: client_id=${result.client_id} project_id=${result.project_id} actions=${JSON.stringify(result.actions)}`
  );

  return sendSuccess(res, result);
});

// Extrai o texto bruto dos arquivos (para anexar à conversa do Bordie, sem criar nada).
const extract = catchAsync(async (req, res) => {
  const files = req.files || [];
  const text = await ingestionService.extractTextFromFiles(files);
  return sendSuccess(res, {
    text,
    files: files.map((f) => f.originalname),
  });
});

module.exports = { analyze, apply, extract };
