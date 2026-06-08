const crypto = require("crypto");
const JSZip = require("jszip");

// Linhas que iniciam uma mensagem nova.
// iOS:    [26/05/2024, 14:32:10] Fulano: texto
// Android: 26/05/2024 14:32 - Fulano: texto  /  5/26/24, 2:32 PM - Fulano: texto
const BRACKET_RE = /^‎?\[([^\]]+)\]\s?([\s\S]*)$/;
const DASH_RE =
  /^‎?(\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap]\.?\s?[Mm]\.?)?)\s-\s([\s\S]*)$/;

// Placeholders de mídia (pt + en, iOS + Android).
const MEDIA_PATTERNS = [
  { type: "image", re: /(imagem ocultada|image omitted|‎?imagem|\.jpe?g|\.png|\.webp|photo)/i },
  { type: "video", re: /(v[íi]deo omitido|video omitted|\.mp4|\.mov)/i },
  { type: "audio", re: /([áa]udio ocultad[oa]|audio omitted|ptt|\.opus|\.m4a|\.mp3|mensagem de voz|voice message)/i },
  { type: "document", re: /(documento omitido|document omitted|\.pdf|\.docx?|\.xlsx?|\.pptx?|\.zip|\.csv)/i },
  { type: "image", re: /(figurinha omitida|sticker omitted|\.webp)/i },
  { type: "video", re: /(gif omitido|gif omitted|\.gif)/i },
  { type: "location", re: /(localiza[çc][ãa]o|location:|maps\.google)/i },
  { type: "contact", re: /(\.vcf|contato omitido|contact card omitted)/i },
  { type: "other", re: /(m[íi]dia oculta|media omitted|‎?<m[íi]dia)/i },
];

const ATTACHED_RE = /<\s*(?:attached|anexado):\s*([^>]+)>/i;
const FILE_ATTACHED_RE = /^‎?(.+?)\s*\((?:file attached|arquivo anexado)\)\s*$/i;

const SYSTEM_HINTS = [
  /end-to-end encrypted/i,
  /criptografadas de ponta a ponta/i,
  /chamadas s[ãa]o protegidas/i,
  /created (this )?group/i,
  /criou o grupo/i,
  /added|adicionou|removed|removeu|left|saiu|changed the subject|mudou o nome|changed this group/i,
  /Your security code|seu c[óo]digo de seguran[çc]a/i,
];

function to2(n) {
  return n < 10 ? `0${n}` : String(n);
}

/** Converte a string de data/hora do WhatsApp em Date (assume dd/mm — padrão pt-BR). */
function parseDate(raw) {
  if (!raw) return null;
  const str = String(raw).replace(/[‎  ]/g, " ").trim();

  const dateMatch = str.match(/(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/);
  const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap])\.?\s?[Mm]\.?/) ||
    str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!dateMatch) return null;

  let a = Number(dateMatch[1]);
  const b = Number(dateMatch[2]);
  let c = Number(dateMatch[3]);

  let year;
  let day;
  let month;
  if (a > 31) {
    // yyyy-mm-dd
    year = a;
    month = b;
    day = c;
  } else {
    day = a;
    month = b;
    year = c;
  }
  if (year < 100) year += 2000;
  if (month > 12 && day <= 12) {
    // veio mm/dd → corrige
    const t = month;
    month = day;
    day = t;
  }

  let hour = 0;
  let min = 0;
  let sec = 0;
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    min = Number(timeMatch[2]);
    sec = Number(timeMatch[3] || 0);
    const ampm = timeMatch[4];
    if (ampm) {
      const isPm = /p/i.test(ampm);
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
    }
  }

  const iso = `${year}-${to2(month)}-${to2(day)}T${to2(hour)}:${to2(min)}:${to2(sec)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function detectMedia(body) {
  const attached = body.match(ATTACHED_RE);
  if (attached) {
    return { attachmentName: attached[1].trim(), contentType: typeFromName(attached[1]) };
  }
  const fileAttached = body.match(FILE_ATTACHED_RE);
  if (fileAttached) {
    return { attachmentName: fileAttached[1].trim(), contentType: typeFromName(fileAttached[1]) };
  }
  for (const p of MEDIA_PATTERNS) {
    if (p.re.test(body)) return { attachmentName: null, contentType: p.type };
  }
  return null;
}

function typeFromName(name = "") {
  const n = name.toLowerCase();
  if (/\.(jpe?g|png|webp|heic)$/.test(n)) return "image";
  if (/\.(mp4|mov|3gp)$/.test(n)) return "video";
  if (/\.(opus|m4a|mp3|aac|ogg)$/.test(n)) return "audio";
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/.test(n)) return "document";
  if (/\.gif$/.test(n)) return "video";
  if (/\.vcf$/.test(n)) return "contact";
  return "other";
}

function isSystemLine(rest, hasSender) {
  if (hasSender) return false;
  return SYSTEM_HINTS.some((re) => re.test(rest)) || true; // sem sender → tratamos como sistema
}

/** Quebra "Fulano: texto" em { senderName, body }. Linhas de sistema vêm sem sender. */
function splitSender(rest) {
  const idx = rest.indexOf(": ");
  if (idx > 0 && idx < 80) {
    const sender = rest.slice(0, idx).trim();
    // sender não pode conter quebra de linha
    if (!sender.includes("\n")) {
      return { senderName: sender, body: rest.slice(idx + 2) };
    }
  }
  return { senderName: null, body: rest };
}

/** Faz o parse do texto do _chat.txt em uma lista de mensagens normalizadas. */
function parseChatText(text) {
  const clean = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n");
  const messages = [];
  let current = null;

  const push = () => {
    if (!current) return;
    const body = current.bodyLines.join("\n").trim();
    const media = detectMedia(body);
    const isSystem = current.senderName === null;
    messages.push({
      sentAt: current.sentAt,
      senderName: current.senderName,
      contentType: media ? media.contentType : "text",
      attachmentName: media ? media.attachmentName : null,
      bodyText: body,
      isSystem,
    });
    current = null;
  };

  for (const line of lines) {
    let m = line.match(BRACKET_RE);
    let dateStr;
    let rest;
    if (m) {
      dateStr = m[1];
      rest = m[2];
    } else {
      m = line.match(DASH_RE);
      if (m) {
        dateStr = m[1];
        rest = m[2];
      }
    }

    if (m) {
      push();
      const sentAt = parseDate(dateStr);
      const { senderName, body } = splitSender(rest);
      current = {
        sentAt,
        senderName: senderName || null,
        bodyLines: [body],
      };
    } else if (current) {
      current.bodyLines.push(line);
    }
    // linhas antes da 1ª mensagem (ex.: BOM) são ignoradas
  }
  push();

  return messages;
}

/** Estatísticas + chave de thread estável (mesma conversa reimportada → mesma chave). */
function summarize(messages, fileName) {
  const senders = [...new Set(messages.filter((x) => x.senderName).map((x) => x.senderName))];
  const isGroup = senders.length > 2;
  const threadKey = crypto
    .createHash("sha1")
    .update(senders.slice().sort().join("|").toLowerCase())
    .digest("hex")
    .slice(0, 16);

  const title = titleFromFileName(fileName) || (isGroup ? senders.slice(0, 3).join(", ") : senders[0] || "Conversa");
  return { senders, isGroup, threadKey, title };
}

function titleFromFileName(fileName) {
  if (!fileName) return null;
  const base = String(fileName).replace(/\.(zip|txt)$/i, "");
  const m =
    base.match(/(?:WhatsApp Chat (?:with|-)\s*)(.+)/i) ||
    base.match(/(?:Conversa do WhatsApp com\s*)(.+)/i) ||
    base.match(/(?:Conversa do WhatsApp -\s*)(.+)/i);
  return m ? m[1].trim() : null;
}

/** Lê um zip de "Exportar conversa" (ou um .txt direto) e devolve mensagens + anexos. */
async function parseExport(buffer, fileName = "") {
  const looksTxt = /\.txt$/i.test(fileName) || (buffer && buffer.slice(0, 1).toString() !== "P");
  if (looksTxt && !/\.zip$/i.test(fileName)) {
    const text = buffer.toString("utf8");
    const messages = parseChatText(text);
    return { messages, attachments: new Map(), ...summarize(messages, fileName) };
  }

  const zip = await JSZip.loadAsync(buffer);
  let chatEntry = null;
  const attachments = new Map();

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const base = path.split("/").pop();
    if (/_chat\.txt$/i.test(base) || (/\.txt$/i.test(base) && !chatEntry)) {
      // prefere _chat.txt; senão o primeiro .txt
      if (/_chat\.txt$/i.test(base) || !chatEntry) chatEntry = entry;
    } else {
      attachments.set(base, entry);
    }
  });

  if (!chatEntry) {
    return { messages: [], attachments, isGroup: false, threadKey: "empty", title: titleFromFileName(fileName) || "Conversa", senders: [] };
  }

  const text = await chatEntry.async("string");
  const messages = parseChatText(text);
  return { messages, attachments, ...summarize(messages, fileName) };
}

module.exports = {
  parseChatText,
  parseExport,
  parseDate,
  typeFromName,
};
