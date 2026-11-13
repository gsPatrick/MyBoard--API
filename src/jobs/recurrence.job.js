const { Op } = require("sequelize");
const { Project, ProjectFinancialEntry } = require("../models");
const { todayISO, computeNextRun, monthLabel } = require("../utils/recurrence");
const { RECURRING_BILLING_STATUSES } = require("../config/constants");

const RECURRENCE_TITLE_PREFIX = "Recebimento recorrente";

/**
 * Gera os recebimentos vencidos de um projeto recorrente (com catch-up),
 * de forma idempotente, e avança o recurrence_next_run.
 */
async function generateForProject(project, today) {
  const day = project.recurrence_day;
  const endDate = project.recurrence_end_date;
  let nextRun = project.recurrence_next_run;
  let created = 0;

  while (nextRun && String(nextRun) <= String(today)) {
    if (endDate && String(nextRun) > String(endDate)) {
      nextRun = null;
      break;
    }

    // Idempotência: não duplica o recebimento do mesmo ciclo.
    const exists = await ProjectFinancialEntry.findOne({
      where: {
        project_id: project.id,
        entry_date: nextRun,
        title: { [Op.like]: `${RECURRENCE_TITLE_PREFIX}%` },
      },
    });

    if (!exists) {
      await ProjectFinancialEntry.create({
        project_id: project.id,
        entry_type: "entrada",
        amount: project.recurrence_amount,
        title: `${RECURRENCE_TITLE_PREFIX} – ${monthLabel(nextRun)}`,
        description: "Gerado automaticamente pela recorrência do projeto.",
        entry_date: nextRun,
      });
      created += 1;
    }

    const advanced = computeNextRun(nextRun, day);
    if (endDate && String(advanced) > String(endDate)) {
      nextRun = null;
      break;
    }
    nextRun = advanced;
  }

  if (String(nextRun || "") !== String(project.recurrence_next_run || "")) {
    await project.update({ recurrence_next_run: nextRun });
  }

  return created;
}

/** Percorre todos os projetos recorrentes com ciclo vencido e gera os recebimentos. */
async function runRecurringBilling() {
  const today = todayISO();
  const projects = await Project.findAll({
    where: {
      is_recurring: true,
      status: { [Op.in]: RECURRING_BILLING_STATUSES },
      recurrence_next_run: { [Op.lte]: today },
    },
  });

  let total = 0;
  for (const project of projects) {
    try {
      total += await generateForProject(project, today);
    } catch (err) {
      console.error(
        `[recurrence] Falha ao gerar recebimento do projeto ${project.id}:`,
        err.message
      );
    }
  }

  if (total > 0) {
    console.log(`[recurrence] ${total} recebimento(s) recorrente(s) gerado(s).`);
  }
  return total;
}

/** Executa o catch-up no boot e reagenda a cada 12h. */
function startRecurrenceScheduler() {
  runRecurringBilling().catch((err) =>
    console.error("[recurrence] Erro na execução inicial:", err.message)
  );

  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    runRecurringBilling().catch((err) =>
      console.error("[recurrence] Erro na execução agendada:", err.message)
    );
  }, TWELVE_HOURS);

  timer.unref?.();
  return timer;
}

module.exports = { runRecurringBilling, startRecurrenceScheduler, generateForProject };
