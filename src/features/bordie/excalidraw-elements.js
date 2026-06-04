const { randomBytes } = require("crypto");

// Paleta alinhada às cores nativas do Excalidraw (boa legibilidade no claro e escuro).
const PALETTE = {
  blue: { bg: "#a5d8ff", stroke: "#1971c2" },
  green: { bg: "#b2f2bb", stroke: "#2f9e44" },
  yellow: { bg: "#ffec99", stroke: "#f08c00" },
  red: { bg: "#ffc9c9", stroke: "#e03131" },
  violet: { bg: "#d0bfff", stroke: "#6741d9" },
  gray: { bg: "#e9ecef", stroke: "#495057" },
  teal: { bg: "#96f2d7", stroke: "#0ca678" },
  orange: { bg: "#ffd8a8", stroke: "#e8590c" },
  pink: { bg: "#fcc2d7", stroke: "#c2255c" },
};

const DEFAULT_COLOR = "blue";

function randomId() {
  return randomBytes(8).toString("hex");
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function isHexColor(value) {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

// Resolve cor por nome (palette) ou hex. backgroundColor pode vir como nome/hex;
// strokeColor acompanha a paleta quando o background é um nome conhecido.
function resolveColors(spec = {}) {
  const raw = spec.color || spec.backgroundColor || DEFAULT_COLOR;

  if (isHexColor(raw)) {
    return {
      backgroundColor: raw,
      strokeColor: isHexColor(spec.strokeColor) ? spec.strokeColor : "#1e1e1e",
    };
  }

  const key = String(raw).toLowerCase();
  const palette = PALETTE[key] || PALETTE[DEFAULT_COLOR];
  return {
    backgroundColor: palette.bg,
    strokeColor: isHexColor(spec.strokeColor) ? spec.strokeColor : palette.stroke,
  };
}

function baseElement(type, overrides = {}) {
  return {
    id: randomId(),
    type,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness:
      type === "rectangle" || type === "diamond" || type === "ellipse" ? { type: 3 } : null,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  };
}

function createBoundText({ containerId, x, y, width, height, label, fontSize = 20 }) {
  const textId = randomId();
  return baseElement("text", {
    id: textId,
    x: x + 12,
    y: y + height / 2 - fontSize / 2,
    width: width - 24,
    height: fontSize * 1.25,
    text: label,
    fontSize,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "middle",
    containerId,
    originalText: label,
    autoResize: true,
    lineHeight: 1.25,
  });
}

// Cria um container (rectangle/diamond/ellipse) com rótulo opcional vinculado.
function createContainer(type, { x, y, width, height, label, backgroundColor, strokeColor }) {
  const containerId = randomId();
  const container = baseElement(type, {
    id: containerId,
    x,
    y,
    width,
    height,
    backgroundColor,
    strokeColor,
  });

  const elements = [container];

  if (label) {
    const text = createBoundText({ containerId, x, y, width, height, label });
    container.boundElements = [{ type: "text", id: text.id }];
    elements.push(text);
  }

  return { elements, container };
}

function createRectangle({ x, y, width, height, label, backgroundColor = "#a5d8ff", strokeColor }) {
  return createContainer("rectangle", {
    x,
    y,
    width,
    height,
    label,
    backgroundColor,
    strokeColor: strokeColor || "#1971c2",
  }).elements;
}

function createText({ x, y, text, fontSize = 28, width = 320 }) {
  return [
    baseElement("text", {
      x,
      y,
      width,
      height: fontSize * 1.4,
      text,
      fontSize,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      originalText: text,
      autoResize: true,
      lineHeight: 1.25,
    }),
  ];
}

function createArrow({ x, y, width, height, label }) {
  const arrowId = randomId();
  const elements = [
    baseElement("arrow", {
      id: arrowId,
      x,
      y,
      width,
      height,
      points: [
        [0, 0],
        [width, height],
      ],
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
    }),
  ];

  if (label) {
    elements.push(
      ...createText({
        x: x + width / 2 - 60,
        y: y + height / 2 - 28,
        text: label,
        fontSize: 16,
        width: 120,
      })
    );
  }

  return elements;
}

function createStickyNote({ x, y, text, backgroundColor }) {
  return createContainer("rectangle", {
    x,
    y,
    width: 220,
    height: 160,
    label: text,
    backgroundColor: backgroundColor || "#ffd43b",
    strokeColor: "#f08c00",
  }).elements;
}

// Entidade/tabela: caixa com título + divisória + lista de campos, tudo agrupado
// (move junto) e conectável por setas. Ideal para ERD de banco, recursos de API
// e blocos de arquitetura de front.
const ENTITY_HEADER_H = 38;
const ENTITY_LINE_H = 24;
const ENTITY_PAD = 12;

function entityHeight(fieldCount) {
  return ENTITY_HEADER_H + Math.max(0, fieldCount) * ENTITY_LINE_H + ENTITY_PAD;
}

function createEntity({ x, y, title, fields = [], width = 240, backgroundColor, strokeColor }) {
  const list = Array.isArray(fields) ? fields.map((f) => String(f)) : [];
  const height = entityHeight(list.length);
  const groupId = randomId();
  const containerId = randomId();
  const stroke = strokeColor || "#1971c2";

  const container = baseElement("rectangle", {
    id: containerId,
    x,
    y,
    width,
    height,
    backgroundColor: backgroundColor || "#ffffff",
    strokeColor: stroke,
    groupIds: [groupId],
    roundness: { type: 3 },
  });

  const titleText = baseElement("text", {
    x: x + 12,
    y: y + 9,
    width: width - 24,
    height: 22,
    text: title,
    originalText: title,
    fontSize: 18,
    fontFamily: 1,
    textAlign: "center",
    verticalAlign: "top",
    groupIds: [groupId],
  });

  const divider = baseElement("line", {
    x,
    y: y + ENTITY_HEADER_H,
    width,
    height: 0,
    points: [
      [0, 0],
      [width, 0],
    ],
    strokeColor: stroke,
    backgroundColor: "transparent",
    groupIds: [groupId],
  });

  const fieldEls = list.map((field, i) =>
    baseElement("text", {
      x: x + 14,
      y: y + ENTITY_HEADER_H + 6 + i * ENTITY_LINE_H,
      width: width - 28,
      height: 20,
      text: field,
      originalText: field,
      fontSize: 15,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      groupIds: [groupId],
    })
  );

  return { elements: [container, titleText, divider, ...fieldEls], container };
}

function centerOf(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Ponto na borda do box na direção de `towards` (clipping retangular aproximado,
// suficiente também para diamond/ellipse).
function borderPoint(box, towards) {
  const c = centerOf(box);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = box.width / 2;
  const hh = box.height / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

// Seta vinculada (binding) entre dois containers já criados. Registra a seta
// no boundElements de cada container para que mova junto ao arrastar.
function createBoundArrow({ fromEl, toEl, label }) {
  const start = borderPoint(fromEl, centerOf(toEl));
  const end = borderPoint(toEl, centerOf(fromEl));
  const arrowId = randomId();

  const arrow = baseElement("arrow", {
    id: arrowId,
    x: start.x,
    y: start.y,
    width: end.x - start.x,
    height: end.y - start.y,
    points: [
      [0, 0],
      [end.x - start.x, end.y - start.y],
    ],
    startBinding: { elementId: fromEl.id, focus: 0, gap: 4 },
    endBinding: { elementId: toEl.id, focus: 0, gap: 4 },
    startArrowhead: null,
    endArrowhead: "arrow",
    strokeColor: "#1e1e1e",
  });

  fromEl.boundElements = [...(fromEl.boundElements || []), { id: arrowId, type: "arrow" }];
  toEl.boundElements = [...(toEl.boundElements || []), { id: arrowId, type: "arrow" }];

  const elements = [arrow];

  if (label) {
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    elements.push(
      ...createText({
        x: mid.x - 50,
        y: mid.y - 22,
        text: label,
        fontSize: 16,
        width: 100,
      })
    );
  }

  return elements;
}

function normalizeIncomingElement(raw = {}) {
  if (!raw.type || raw.isDeleted) return null;

  const defaults = baseElement(raw.type, raw);
  if (raw.type === "arrow" && !Array.isArray(raw.points)) {
    defaults.points = [
      [0, 0],
      [raw.width || 120, raw.height || 0],
    ];
  }
  if (raw.type === "text" && raw.text) {
    defaults.originalText = raw.originalText || raw.text;
  }
  return defaults;
}

const SHAPE_KINDS = {
  box: "rectangle",
  rectangle: "rectangle",
  card: "rectangle",
  diamond: "diamond",
  decision: "diamond",
  ellipse: "ellipse",
  circle: "ellipse",
  oval: "ellipse",
  note: "note",
  sticky: "note",
  entity: "entity",
  table: "entity",
  model: "entity",
  schema: "entity",
  class: "entity",
  component: "entity",
};

// Layout automático em grade para shapes sem coordenadas explícitas.
// Lê-se da esquerda para a direita, quebrando a cada `columns`.
function autoLayoutPositions(count, { origin = { x: 80, y: 80 }, columns, cellW = 240, cellH = 130, gapX = 90, gapY = 80 } = {}) {
  const cols = columns || Math.min(Math.max(Math.ceil(Math.sqrt(count)), 1), 4);
  const positions = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: origin.x + col * (cellW + gapX),
      y: origin.y + row * (cellH + gapY),
    });
  }
  return positions;
}

// Constrói elementos a partir de specs simplificadas.
// Retorna { elements, idMap } — idMap mapeia spec.id e o label normalizado
// para o id do elemento criado, permitindo conexões (setas) e edições.
function buildElementsFromSpec(specs = [], options = {}) {
  const origin = options.origin || { x: 80, y: 80 };
  const elements = [];
  const idMap = {};
  const containersByRef = {};

  const headings = [];
  const shapes = [];
  const looseArrows = [];
  const passthrough = [];

  for (const spec of specs) {
    const kind = SHAPE_KINDS[String(spec.kind || spec.type || "").toLowerCase()];
    if (
      kind === "rectangle" ||
      kind === "diamond" ||
      kind === "ellipse" ||
      kind === "note" ||
      kind === "entity"
    ) {
      shapes.push({ spec, kind });
    } else if (spec.kind === "text" || spec.kind === "heading") {
      headings.push(spec);
    } else if (spec.kind === "arrow") {
      looseArrows.push(spec);
    } else if (spec.type) {
      passthrough.push(spec);
    }
  }

  let cursorY = origin.y;

  // Cabeçalhos/textos empilhados no topo.
  for (const spec of headings) {
    const isHeading = spec.kind === "heading";
    const created = createText({
      x: spec.x ?? origin.x,
      y: spec.y ?? cursorY,
      text: spec.text || spec.label || "",
      fontSize: isHeading ? 36 : spec.fontSize || 24,
      width: spec.width || 480,
    });
    elements.push(...created);
    cursorY = (spec.y ?? cursorY) + (isHeading ? 70 : 56);
  }

  // Shapes: usa coordenadas explícitas quando existem, senão grade automática.
  const shapeOrigin = { x: origin.x, y: headings.length ? cursorY + 20 : origin.y };

  // Mede cada shape primeiro (entities têm altura variável) para que a grade
  // não sobreponha shapes altos.
  const measured = shapes.map(({ spec, kind }) => {
    let width;
    let height;
    if (kind === "entity") {
      const fieldCount = Array.isArray(spec.fields) ? spec.fields.length : 0;
      width = spec.width || 240;
      height = spec.height || entityHeight(fieldCount);
    } else if (kind === "note") {
      width = spec.width || 220;
      height = spec.height || 160;
    } else if (kind === "ellipse") {
      width = spec.width || 200;
      height = spec.height || 120;
    } else if (kind === "diamond") {
      width = spec.width || 240;
      height = spec.height || 140;
    } else {
      width = spec.width || 240;
      height = spec.height || 120;
    }
    return { spec, kind, width, height };
  });

  const maxW = Math.max(240, ...measured.map((m) => m.width));
  const maxH = Math.max(130, ...measured.map((m) => m.height));
  const autoPositions = autoLayoutPositions(measured.length, {
    origin: shapeOrigin,
    cellW: maxW,
    cellH: maxH,
  });

  measured.forEach(({ spec, kind, width, height }, index) => {
    const pos = autoPositions[index] || shapeOrigin;
    const x = spec.x ?? pos.x;
    const y = spec.y ?? pos.y;
    const colors = resolveColors(spec);

    let result;
    if (kind === "entity") {
      const built = createEntity({
        x,
        y,
        width,
        title: spec.label || spec.title || spec.text || "Entidade",
        fields: Array.isArray(spec.fields) ? spec.fields : [],
        backgroundColor: isHexColor(spec.color) ? spec.color : "#ffffff",
        strokeColor: colors.strokeColor,
      });
      elements.push(...built.elements);
      result = built;
    } else if (kind === "note") {
      const note = createStickyNote({
        x,
        y,
        text: spec.text || spec.label || "Nota",
        backgroundColor: isHexColor(spec.color) ? spec.color : undefined,
      });
      elements.push(...note);
      result = { container: note[0] };
    } else {
      const built = createContainer(kind, {
        x,
        y,
        width,
        height,
        label: spec.label || spec.text || "",
        backgroundColor: colors.backgroundColor,
        strokeColor: colors.strokeColor,
      });
      elements.push(...built.elements);
      result = built;
    }

    const ref = spec.id || spec.ref || spec.label || spec.title || spec.text;
    if (ref && result.container) {
      const key = String(ref).toLowerCase().trim();
      idMap[key] = result.container.id;
      containersByRef[key] = result.container;
      if (spec.id) {
        idMap[String(spec.id)] = result.container.id;
        containersByRef[String(spec.id)] = result.container;
      }
    }
  });

  // Setas soltas (sem binding) — coordenadas explícitas.
  for (const spec of looseArrows) {
    elements.push(
      ...createArrow({
        x: spec.x ?? origin.x,
        y: spec.y ?? cursorY,
        width: spec.width || 160,
        height: spec.height || 0,
        label: spec.label || "",
      })
    );
  }

  // Elementos completos passados diretamente.
  for (const spec of passthrough) {
    const normalized = normalizeIncomingElement(spec);
    if (normalized) elements.push(normalized);
  }

  return { elements, idMap, containersByRef };
}

// Cria setas vinculadas a partir de uma lista de conexões { from, to, label },
// onde from/to referenciam ids/labels presentes no idMap.
function buildConnections(connections = [], containersByRef = {}) {
  const elements = [];
  for (const conn of connections) {
    const fromKey = String(conn.from || conn.source || "").toLowerCase().trim();
    const toKey = String(conn.to || conn.target || "").toLowerCase().trim();
    const fromEl = containersByRef[fromKey] || containersByRef[conn.from] || containersByRef[conn.source];
    const toEl = containersByRef[toKey] || containersByRef[conn.to] || containersByRef[conn.target];
    if (!fromEl || !toEl || fromEl === toEl) continue;
    elements.push(...createBoundArrow({ fromEl, toEl, label: conn.label || "" }));
  }
  return elements;
}

module.exports = {
  PALETTE,
  randomId,
  baseElement,
  resolveColors,
  createRectangle,
  createText,
  createArrow,
  createStickyNote,
  createContainer,
  createEntity,
  createBoundArrow,
  buildElementsFromSpec,
  buildConnections,
  normalizeIncomingElement,
  centerOf,
  borderPoint,
};
