const { randomBytes } = require("crypto");

function randomId() {
  return randomBytes(8).toString("hex");
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
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
    roundness: type === "rectangle" || type === "diamond" ? { type: 3 } : null,
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

function createRectangle({ x, y, width, height, label, backgroundColor = "#a5d8ff" }) {
  const rectId = randomId();
  const elements = [
    baseElement("rectangle", {
      id: rectId,
      x,
      y,
      width,
      height,
      backgroundColor,
      boundElements: label ? [{ type: "text", id: "__text__" }] : null,
    }),
  ];

  if (label) {
    const textId = randomId();
    elements[0].boundElements = [{ type: "text", id: textId }];
    elements.push(
      baseElement("text", {
        id: textId,
        x: x + 12,
        y: y + height / 2 - 12,
        width: width - 24,
        height: 24,
        text: label,
        fontSize: 20,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: rectId,
        originalText: label,
        autoResize: true,
        lineHeight: 1.25,
      })
    );
  }

  return elements;
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

function createStickyNote({ x, y, text }) {
  return createRectangle({
    x,
    y,
    width: 220,
    height: 160,
    label: text,
    backgroundColor: "#ffd43b",
  });
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

function buildElementsFromSpec(specs = []) {
  const elements = [];
  let cursorX = 80;
  let cursorY = 80;

  for (const spec of specs) {
    const kind = spec.kind || spec.type;
    const x = spec.x ?? cursorX;
    const y = spec.y ?? cursorY;

    if (kind === "rectangle" || kind === "box") {
      elements.push(
        ...createRectangle({
          x,
          y,
          width: spec.width || 240,
          height: spec.height || 120,
          label: spec.label || spec.text || "",
          backgroundColor: spec.backgroundColor || spec.color || "#a5d8ff",
        })
      );
      cursorY += (spec.height || 120) + 40;
    } else if (kind === "text" || kind === "heading") {
      elements.push(
        ...createText({
          x,
          y,
          text: spec.text || spec.label || "",
          fontSize: kind === "heading" ? 36 : spec.fontSize || 24,
          width: spec.width || 400,
        })
      );
      cursorY += 80;
    } else if (kind === "arrow") {
      elements.push(
        ...createArrow({
          x,
          y,
          width: spec.width || 160,
          height: spec.height || 0,
          label: spec.label || "",
        })
      );
      cursorY += 60;
    } else if (kind === "note" || kind === "sticky") {
      elements.push(...createStickyNote({ x, y, text: spec.text || spec.label || "Nota" }));
      cursorY += 200;
    } else if (spec.type) {
      const normalized = normalizeIncomingElement(spec);
      if (normalized) elements.push(normalized);
    }
  }

  return elements;
}

module.exports = {
  randomId,
  baseElement,
  createRectangle,
  createText,
  createArrow,
  createStickyNote,
  buildElementsFromSpec,
  normalizeIncomingElement,
};
