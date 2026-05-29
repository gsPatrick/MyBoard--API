const { DateTime } = require("luxon");
const { APP_TIMEZONE } = require("../config/constants");

function nowInAppTimezone() {
  return DateTime.now().setZone(APP_TIMEZONE);
}

function parseLocalDateTime(input, timezone = APP_TIMEZONE) {
  if (!input) return null;

  const dt = DateTime.fromISO(String(input), { zone: timezone });
  if (!dt.isValid) {
    return null;
  }

  return dt.toUTC();
}

function formatForResponse(dateValue, timezone = APP_TIMEZONE) {
  if (!dateValue) return null;

  const utc = DateTime.fromJSDate(new Date(dateValue), { zone: "utc" });
  const local = utc.setZone(timezone);

  return {
    utc: utc.toISO(),
    local: local.toISO(),
    localFormatted: local.toFormat("dd/MM/yyyy HH:mm"),
    timezone,
    timestamp: utc.toMillis(),
  };
}

function formatAgendaEvent(event) {
  const plain = event.toJSON ? event.toJSON() : { ...event };
  const tz = plain.timezone || APP_TIMEZONE;

  return {
    ...plain,
    starts_at_display: formatForResponse(plain.starts_at, tz),
    ends_at_display: plain.ends_at ? formatForResponse(plain.ends_at, tz) : null,
  };
}

function getDateRangeForAgendaQuery(from, to, timezone = APP_TIMEZONE) {
  const start = parseLocalDateTime(from || DateTime.now().setZone(timezone).startOf("month").toISO(), timezone);
  const end = parseLocalDateTime(
    to || DateTime.now().setZone(timezone).endOf("month").toISO(),
    timezone
  );

  return { start: start?.toJSDate(), end: end?.toJSDate() };
}

module.exports = {
  APP_TIMEZONE,
  nowInAppTimezone,
  parseLocalDateTime,
  formatForResponse,
  formatAgendaEvent,
  getDateRangeForAgendaQuery,
};
