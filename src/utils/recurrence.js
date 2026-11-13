const { DateTime } = require("luxon");
const { APP_TIMEZONE } = require("../config/constants");

/** Data de hoje (YYYY-MM-DD) no fuso do app. */
function todayISO() {
  return DateTime.now().setZone(APP_TIMEZONE).toISODate();
}

/**
 * A ocorrência do "dia X" dentro de um mês, ajustando para o último dia
 * quando o mês não tem esse dia (ex.: dia 30 em fevereiro -> 28/29).
 */
function occurrenceInMonth(year, month, day) {
  const base = DateTime.fromObject({ year, month, day: 1 });
  const clampedDay = Math.min(day, base.daysInMonth);
  return DateTime.fromObject({ year, month, day: clampedDay });
}

/**
 * Primeira data de recebimento >= start, ancorada no dia informado.
 * Retorna YYYY-MM-DD.
 */
function computeFirstRun(startISO, day) {
  const start = DateTime.fromISO(String(startISO));
  if (!start.isValid) return null;

  let occ = occurrenceInMonth(start.year, start.month, day);
  if (occ.toISODate() < start.toISODate()) {
    const next = start.plus({ months: 1 });
    occ = occurrenceInMonth(next.year, next.month, day);
  }
  return occ.toISODate();
}

/**
 * Próxima data de recebimento a partir de uma data já gerada, ancorada no
 * dia informado (re-ancora todo mês, então não "gruda" no dia ajustado).
 * Retorna YYYY-MM-DD.
 */
function computeNextRun(currentRunISO, day) {
  const cur = DateTime.fromISO(String(currentRunISO));
  if (!cur.isValid) return null;

  const next = cur.plus({ months: 1 });
  return occurrenceInMonth(next.year, next.month, day).toISODate();
}

/** Rótulo curto do mês/ano de uma data (ex.: "ago/2026"). */
function monthLabel(dateISO) {
  const dt = DateTime.fromISO(String(dateISO)).setLocale("pt-BR");
  if (!dt.isValid) return String(dateISO);
  return dt.toFormat("LLL/yyyy");
}

/** Último dia do mês anterior (YYYY-MM-DD) no fuso do app. */
function lastDayOfPreviousMonthISO() {
  return DateTime.now().setZone(APP_TIMEZONE).startOf("month").minus({ days: 1 }).toISODate();
}

module.exports = {
  todayISO,
  lastDayOfPreviousMonthISO,
  occurrenceInMonth,
  computeFirstRun,
  computeNextRun,
  monthLabel,
};
