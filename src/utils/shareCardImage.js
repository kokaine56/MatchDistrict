import shareTemplateUrl from '../assets/share-template.png';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1536;
const MX = 90;
const CONTENT_W = CARD_WIDTH - MX * 2;

const FONT_FAMILY = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';

const TEXT_GOLD = '#FBBF24';

let shareTemplateReady = false;
const templateImg = new Image();
templateImg.onload = () => { shareTemplateReady = true; };
templateImg.src = shareTemplateUrl;

/* ------------------------------------------------------------------ */
/* Layout constants (fixed 1080×1536 coordinate system)                */
/* All dynamic info lives in the lower information area of the template */
/* ------------------------------------------------------------------ */
const TITLE_Y_SINGLE = 1080;
const TITLE_Y_LINE1 = 1016;
const TITLE_Y_LINE2 = 1114;
const TITLE_MAX_FONT = 78;
const TITLE_MIN_FONT = 44;
const TITLE_MAX_LINES = 2;

const ORG_LABEL_Y = 1240;
const ORG_NAME_Y = 1280;

const STAT_LABEL_Y1 = 1346;
const STAT_VALUE_Y1 = 1382;
const STAT_LABEL_Y2 = 1458;
const STAT_VALUE_Y2 = 1494;
const STAT_GAP = 80;
const STAT_COL_W = (CONTENT_W - STAT_GAP) / 2;
const STAT_LEFT_X = MX + STAT_COL_W / 2;
const STAT_RIGHT_X = MX + STAT_COL_W + STAT_GAP + STAT_COL_W / 2;
const STAT_VALUE_MAX_FONT = 36;
const STAT_VALUE_MIN_FONT = 22;

const URL_Y = 1514;
const URL_MAX_FONT = 24;
const URL_MIN_FONT = 16;

/* ------------------------------------------------------------------ */
/* Typography rendering helpers                                        */
/* ------------------------------------------------------------------ */

function verticalGradient(ctx, x, y, fontSize, topColor, bottomColor) {
  const g = ctx.createLinearGradient(x, y - fontSize * 1.2, x, y + fontSize * 0.25);
  g.addColorStop(0, topColor);
  g.addColorStop(1, bottomColor);
  return g;
}

/**
 * Engraved/embossed premium text renderer.
 * Draws: optional glow halo → deep drop shadow → dark bevel offset →
 * light top-highlight → crisp metallic-gradient main fill.
 * Never scales/skews the glyphs (no distortion).
 */
function paintText(ctx, text, x, y, {
  font,
  gradTop,
  gradBottom,
  glow = null,
  glowBlur = 18,
  dropShadow = true,
  bevel = true,
  highlight = true,
  shadowAlpha = 0.55
}) {
  ctx.font = font;
  const grad = verticalGradient(ctx, x, y, parseFloat(font.match(/\d+(?:\.\d+)?/)?.[0] || '20'), gradTop, gradBottom);

  // Glow halo (before everything, behind the shadow)
  if (glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = grad;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Deep drop shadow for lift/embedding
  if (dropShadow) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = grad;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // Dark bevel (engraved depth) under the glyph edge
  if (bevel) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, x + 1, y + 2);
    ctx.fillText(text, x + 1, y + 1);
  }

  // Light top highlight (metallic rim catch-light)
  if (highlight) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillText(text, x - 1, y - 1);
  }

  // Crisp main fill with metallic gradient
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
}

function renderSmallLabel(ctx, text, x, y, letterSpacing = 4) {
  ctx.save();
  ctx.font = `700 18px ${FONT_FAMILY}`;
  ctx.letterSpacing = `${letterSpacing}px`;
  paintText(ctx, text, x, y, {
    gradTop: '#E6EDF7',
    gradBottom: '#93A8C4',
    glow: 'rgba(59,130,246,0.18)',
    glowBlur: 10,
    dropShadow: true,
    bevel: false,
    highlight: true,
    shadowAlpha: 0.4
  });
  ctx.restore();
}

function fitFontSize(ctx, text, weight, baseSize, maxWidth, minSize) {
  let size = baseSize;
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  }
  return size;
}

function wrapToLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) {
        let tail = line;
        for (let j = i + 1; j < words.length; j++) tail += ` ${words[j]}`;
        return (ctx.measureText(tail).width > maxWidth)
          ? [...lines, fitEllipsis(ctx, tail, maxWidth)[0]]
          : [...lines, tail];
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitTitleFont(ctx, text, maxWidth, maxFont, minFont) {
  let size = maxFont;
  let lines = [];
  let fits = false;
  while (size >= minFont && !fits) {
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    lines = wrapToLines(ctx, text, maxWidth, TITLE_MAX_LINES);
    fits = lines.length <= TITLE_MAX_LINES && lines.every((ln) => ctx.measureText(ln).width <= maxWidth);
    if (!fits) size -= 2;
  }
  if (lines.length === 0) {
    ctx.font = `800 ${minFont}px ${FONT_FAMILY}`;
    lines = fitEllipsis(ctx, String(text || ''), maxWidth);
  }
  return { lines, fontSize: size };
}

function fitEllipsis(ctx, text, maxWidth) {
  let candidate = text;
  while (candidate.length > 1 && ctx.measureText(`${candidate}…`).width > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return [`${candidate}…`];
}

/* ------------------------------------------------------------------ */
/* Section renderers                                                   */
/* ------------------------------------------------------------------ */

function renderTournamentTitle(ctx, title) {
  const { lines, fontSize } = fitTitleFont(ctx, title, CONTENT_W, TITLE_MAX_FONT, TITLE_MIN_FONT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const ys = lines.length === 2 ? [TITLE_Y_LINE1, TITLE_Y_LINE2] : [TITLE_Y_SINGLE];
  lines.forEach((line, i) => {
    paintText(ctx, line, CARD_WIDTH / 2, ys[Math.min(i, ys.length - 1)], {
      font: `800 ${fontSize}px ${FONT_FAMILY}`,
      gradTop: '#FFFFFF',
      gradBottom: '#B9C4DA',
      glow: 'rgba(59,130,246,0.28)',
      glowBlur: 22,
      dropShadow: true,
      bevel: true,
      highlight: true,
      shadowAlpha: 0.6
    });
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function renderGameChip(ctx, game, rowY) {
  const label = String(game || '').toUpperCase();
  if (!label) return;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = `700 16px ${FONT_FAMILY}`;
  const tw = ctx.measureText(label).width;
  const padX = 26;
  const chipW = tw + padX * 2;
  const chipH = 40;
  const cx = CARD_WIDTH - MX;
  const cy = rowY + 10;
  const rx = cx - chipW;
  const ry = cy - chipH / 2;

  // Glass chip plate
  const plate = ctx.createLinearGradient(0, ry, 0, ry + chipH);
  plate.addColorStop(0, 'rgba(20,30,55,0.72)');
  plate.addColorStop(1, 'rgba(8,14,28,0.72)');
  roundRectPath(ctx, rx, ry, chipW, chipH, chipH / 2);
  ctx.fillStyle = plate;
  ctx.fill();
  // Hairline glow border
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(96,165,250,0.55)';
  ctx.stroke();

  ctx.fillStyle = TEXT_GOLD;
  ctx.shadowColor = 'rgba(251,191,36,0.35)';
  ctx.shadowBlur = 8;
  ctx.letterSpacing = '1.5px';
  ctx.fillText(label, cx - padX, cy);
  ctx.restore();
}

function renderOrganizer(ctx, orgName, game) {
  const label = 'ORGANIZED BY';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  renderSmallLabel(ctx, label, CARD_WIDTH / 2, ORG_LABEL_Y, 4);

  // Game chip sits right-aligned on the organizer label row
  renderGameChip(ctx, game, ORG_LABEL_Y);

  const name = String(orgName || '');
  if (name) {
    const size = fitFontSize(ctx, name, '700', 30, CONTENT_W, 18);
    paintText(ctx, name, CARD_WIDTH / 2, ORG_NAME_Y, {
      font: `700 ${size}px ${FONT_FAMILY}`,
      gradTop: '#FFFFFF',
      gradBottom: '#C7D2E4',
      dropShadow: true,
      bevel: true,
      highlight: true,
      shadowAlpha: 0.5
    });
  }
}

function renderStatItem(ctx, x, labelY, valueY, label, value, prizeHighlight) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  renderSmallLabel(ctx, String(label).toUpperCase(), x, labelY, 3);

  const valueStr = String(value === '' || value === undefined || value === null ? '—' : value);
  const size = fitFontSize(ctx, valueStr, '800', STAT_VALUE_MAX_FONT, STAT_COL_W - 20, STAT_VALUE_MIN_FONT);

  if (prizeHighlight) {
    // Prize Pool gets the strongest emphasis: gold metallic + gold glow
    paintText(ctx, valueStr, x, valueY, {
      font: `800 ${size}px ${FONT_FAMILY}`,
      gradTop: '#FFE9A6',
      gradBottom: '#E08512',
      glow: 'rgba(251,191,36,0.5)',
      glowBlur: 20,
      dropShadow: true,
      bevel: true,
      highlight: true,
      shadowAlpha: 0.65
    });
  } else {
    paintText(ctx, valueStr, x, valueY, {
      font: `800 ${size}px ${FONT_FAMILY}`,
      gradTop: '#FFFFFF',
      gradBottom: '#BFCAE0',
      glow: 'rgba(255,255,255,0.12)',
      glowBlur: 8,
      dropShadow: true,
      bevel: true,
      highlight: true,
      shadowAlpha: 0.55
    });
  }
}

function renderStats(ctx, prize, entry, format, slots) {
  renderStatItem(ctx, STAT_LEFT_X, STAT_LABEL_Y1, STAT_VALUE_Y1, 'Prize Pool', prize, true);
  renderStatItem(ctx, STAT_RIGHT_X, STAT_LABEL_Y1, STAT_VALUE_Y1, 'Entry Fee', entry === '' ? '—' : entry, false);
  renderStatItem(ctx, STAT_LEFT_X, STAT_LABEL_Y2, STAT_VALUE_Y2, 'Format', format, false);
  renderStatItem(ctx, STAT_RIGHT_X, STAT_LABEL_Y2, STAT_VALUE_Y2, 'Slots', slots, false);
}

function renderURL(ctx, url) {
  const clean = String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!clean) return;
  const size = fitFontSize(ctx, clean, '700', URL_MAX_FONT, CONTENT_W, URL_MIN_FONT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  paintText(ctx, clean, CARD_WIDTH / 2, URL_Y, {
    font: `700 ${size}px ${FONT_FAMILY}`,
    gradTop: '#B5D4FF',
    gradBottom: '#4F8FEA',
    glow: 'rgba(59,130,246,0.45)',
    glowBlur: 16,
    dropShadow: true,
    bevel: false,
    highlight: true,
    shadowAlpha: 0.6
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function ensureShareTemplateReady() {
  return new Promise((resolve) => {
    if (shareTemplateReady) return resolve(true);
    const onLoad = () => { shareTemplateReady = true; resolve(true); };
    const onError = () => resolve(false);
    templateImg.addEventListener('load', onLoad, { once: true });
    templateImg.addEventListener('error', onError, { once: true });
    if (templateImg.complete) {
      shareTemplateReady = true;
      return resolve(true);
    }
  });
}

export function generateTournamentShareCard({
  title,
  orgName,
  prize,
  entry,
  format,
  slots,
  game,
  url
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (shareTemplateReady && templateImg.naturalWidth > 0) {
    ctx.drawImage(templateImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  } else {
    const fb = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
    fb.addColorStop(0, '#0B1020');
    fb.addColorStop(1, '#1E3A8A');
    ctx.fillStyle = fb;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  renderTournamentTitle(ctx, title);
  renderOrganizer(ctx, orgName, game);
  renderStats(ctx, prize, entry, format, slots);
  renderURL(ctx, url);

  return canvas.toDataURL('image/png');
}

export function dataURLToFile(dataUrl, filename) {
  const parts = dataUrl.split(',');
  const header = parts[0];
  const mime = (header.match(/:(.*?);/) || ['', 'image/png'])[1];
  const b64 = atob(parts[1]);
  const len = b64.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = b64.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export function downloadDataURL(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}