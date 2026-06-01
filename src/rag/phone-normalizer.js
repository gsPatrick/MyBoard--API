function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhoneDigits(value) {
  const digits = digitsOnly(value);
  if (!digits) return null;

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function toE164(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return null;
  return `+${digits}`;
}

function jidToPhoneDigits(jid) {
  if (!jid) return null;
  const raw = String(jid).split("@")[0];
  return normalizePhoneDigits(raw);
}

function phoneToWhatsappJid(phoneDigits) {
  const digits = normalizePhoneDigits(phoneDigits);
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function isGroupJid(jid) {
  return String(jid || "").endsWith("@g.us");
}

function normalizeGroupExternalId(jid) {
  if (!jid) return null;
  if (isGroupJid(jid)) return String(jid).split("@")[0];
  return null;
}

module.exports = {
  digitsOnly,
  normalizePhoneDigits,
  toE164,
  jidToPhoneDigits,
  phoneToWhatsappJid,
  isGroupJid,
  normalizeGroupExternalId,
};
