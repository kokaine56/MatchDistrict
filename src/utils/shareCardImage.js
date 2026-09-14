const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1500;
const CORNER_RADIUS = 44;
const MX = 50;

const FONT_FAMILY = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';

const GOLD = '#FBBF24';
const WHITE = '#F1F5F9';
const MUTED = '#7C8AA0';
const MUTED_90 = 'rgba(148,163,184,0.9)';

const WALLET_TOP = 1012;
const WALLET_INSET = 18;

let logoReady = false;
const logoImg = new Image();
logoImg.onload = () => { logoReady = true; };
logoImg.src = '/logo.png';

const imageCache = new Map();

function drawRoundRectPath(ctx, x, y, w, h, r) {
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

function wrapText(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) {
        const next = lines.pop();
        return fitEllipsis(ctx, next, maxWidth);
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitEllipsis(ctx, text, maxWidth) {
  let candidate = text;
  while (candidate.length > 1 && ctx.measureText(`${candidate}…`).width > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return [`${candidate}…`];
}

function fitFontSize(ctx, text, family, baseSize, maxWidth, minSize) {
  let size = baseSize;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `800 ${size}px ${family}`;
  }
  return size;
}

function drawCoverImage(ctx, img, x, y, w, h, topBias) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const boxA = w / h;
  const imgA = iw / ih;
  let sx, sy, sw, sh;
  if (imgA > boxA) {
    sw = ih * boxA;
    sh = ih;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = iw / boxA;
    sx = 0;
    sy = (ih - sh) * (topBias || 0.35);
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawStar(ctx, cx, cy, outerR, innerR) {
  const spikes = 5;
  let rot = -Math.PI / 2;
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += Math.PI / spikes;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += Math.PI / spikes;
  }
  ctx.closePath();
  ctx.fill();
}

function drawStitching(ctx, x, y, w, h, r, color, lw) {
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  drawRoundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function peekShareCardImage(url) {
  if (!url) return null;
  const v = imageCache.get(url);
  return v && typeof v === 'object' && v.tagName === 'IMG' && v.complete && v.naturalWidth > 0 ? v : null;
}

export function ensureShareCardImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const existing = peekShareCardImage(url);
    if (existing) return resolve(existing);
    if (imageCache.get(url) === 'failed') return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    img.onload = () => { imageCache.set(url, img); done(img.naturalWidth > 0 ? img : null); };
    img.onerror = () => { imageCache.set(url, 'failed'); done(null); };
    img.src = url;
  });
}

export function generateTournamentShareCard({
  title = 'Tournament',
  orgName = '',
  prize = '',
  entry = '',
  format = '',
  slots = '',
  game = '',
  date = '',
  verified = false,
  imageUrl = '',
  imageEl = null
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  let dateLine = '';
  if (date) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      try { dateLine = d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { dateLine = ''; }
    }
  }

  /* ---- Card canvas (transparent rounded corners) ---- */
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  drawRoundRectPath(ctx, 0, 0, W, H, CORNER_RADIUS);
  ctx.clip();

  /* ---- Exposed card face: poster (0 → WALLET_TOP) ---- */
  const loadedImg = imageEl || peekShareCardImage(imageUrl);
  if (loadedImg) {
    ctx.save();
    drawRoundRectPath(ctx, 0, 0, W, WALLET_TOP, 0);
    ctx.clip();
    drawCoverImage(ctx, loadedImg, 0, 0, W, WALLET_TOP, 0.35);
    ctx.restore();
  } else {
    const fb = ctx.createLinearGradient(0, 0, 0, WALLET_TOP);
    fb.addColorStop(0, '#1E3A8A');
    fb.addColorStop(1, '#2563EB');
    ctx.fillStyle = fb;
    ctx.fillRect(0, 0, W, WALLET_TOP);
    ctx.fillStyle = 'rgba(148,163,184,0.2)';
    ctx.font = `900 140px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MD', W / 2, WALLET_TOP / 2 - 30);
    ctx.fillStyle = 'rgba(241,245,249,0.9)';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.letterSpacing = '5px';
    ctx.fillText('TOURNAMENT POSTER', W / 2, WALLET_TOP / 2 + 80);
    ctx.letterSpacing = '0px';
  }

  /* Top scrim for logo legibility */
  const topScrim = ctx.createLinearGradient(0, 0, 0, 200);
  topScrim.addColorStop(0, 'rgba(0,0,0,0.55)');
  topScrim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topScrim;
  ctx.fillRect(0, 0, W, 200);

  /* Logo */
  if (logoReady && logoImg.naturalWidth > 0) {
    const logoH = 56;
    const logoW = logoH * (logoImg.naturalWidth / logoImg.naturalHeight);
    ctx.drawImage(logoImg, MX, 36, logoW, logoH);
  } else {
    drawRoundRectPath(ctx, MX, 36, 44, 44, 12);
    ctx.fillStyle = '#2563EB';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 24px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', MX + 22, 58);
  }

  /* Bottom scrim for title */
  const botScrim = ctx.createLinearGradient(0, 830, 0, WALLET_TOP);
  botScrim.addColorStop(0, 'rgba(0,0,0,0)');
  botScrim.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  botScrim.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = botScrim;
  ctx.fillRect(0, 830, W, WALLET_TOP - 830);

  /* Game chip */
  if (game) {
    const chipLabel = String(game).toUpperCase();
    ctx.font = `700 13px ${FONT_FAMILY}`;
    const tw = ctx.measureText(chipLabel).width;
    const cw = tw + 36;
    drawRoundRectPath(ctx, MX, 870, cw, 30, 15);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '1.5px';
    ctx.fillText(chipLabel, MX + 18, 885);
    ctx.letterSpacing = '0px';
  }

  /* Title on poster */
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 54px ${FONT_FAMILY}`;
  const maxTitleW = W - 2 * MX;
  const titleLines = wrapText(ctx, title, maxTitleW, 2);
  const titleY0 = titleLines.length === 2 ? 908 : 948;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  titleLines.forEach((line, i) => {
    ctx.fillText(line, MX, titleY0 + i * 60);
  });

  /* ---- Wallet / Card Holder (WALLET_TOP → H) ---- */
  const walletGrad = ctx.createLinearGradient(0, WALLET_TOP, 0, H);
  walletGrad.addColorStop(0, '#1A1726');
  walletGrad.addColorStop(0.5, '#12101C');
  walletGrad.addColorStop(1, '#0C0A12');
  ctx.fillStyle = walletGrad;
  ctx.fillRect(0, WALLET_TOP, W, H - WALLET_TOP);

  /* Pocket shadow */
  const pocketShadow = ctx.createLinearGradient(0, WALLET_TOP, 0, WALLET_TOP + 50);
  pocketShadow.addColorStop(0, 'rgba(0,0,0,0.55)');
  pocketShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pocketShadow;
  ctx.fillRect(0, WALLET_TOP, W, 50);

  /* Pocket rim highlight */
  const rimGrad = ctx.createLinearGradient(100, 0, W - 100, 0);
  rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
  rimGrad.addColorStop(0.3, 'rgba(255,255,255,0.12)');
  rimGrad.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, WALLET_TOP + 1, W, 2);

  /* Stitching */
  const sX = WALLET_INSET;
  const sY = WALLET_TOP + WALLET_INSET;
  const sW = W - WALLET_INSET * 2;
  const sH = H - WALLET_TOP - WALLET_INSET * 2;
  drawStitching(ctx, sX, sY, sW, sH, 30, 'rgba(255,255,255,0.055)', 1.5);

  /* ---- Wallet content ---- */
  const cX = MX;
  const cW = W - MX * 2;
  const contentStart = WALLET_TOP + 48;
  ctx.textAlign = 'left';

  /* TOURNAMENT label + name */
  ctx.fillStyle = MUTED;
  ctx.font = `600 12px ${FONT_FAMILY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '2px';
  ctx.fillText('TOURNAMENT', cX, contentStart);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = WHITE;
  ctx.font = `800 22px ${FONT_FAMILY}`;
  const titleMaxW = cW;
  const walletTitleLines = wrapText(ctx, title, titleMaxW, 2);
  walletTitleLines.forEach((line, i) => {
    ctx.fillText(line, cX, contentStart + 32 + i * 30);
  });
  const walletTitleBottom = contentStart + 32 + (walletTitleLines.length - 1) * 30;

  /* ORGANIZED BY label + value */
  const orgY = walletTitleBottom + 36;
  ctx.fillStyle = MUTED;
  ctx.font = `600 12px ${FONT_FAMILY}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('ORGANIZED BY', cX, orgY);
  ctx.letterSpacing = '0px';

  const orgValY = orgY + 28;
  ctx.textBaseline = 'middle';
  let orgX = cX;
  if (orgName) {
    if (verified) {
      ctx.fillStyle = GOLD;
      drawStar(ctx, orgX + 12, orgValY, 10, 4.2);
      orgX += 26;
    }
    ctx.fillStyle = WHITE;
    ctx.font = `600 17px ${FONT_FAMILY}`;
    ctx.fillText(String(orgName), orgX, orgValY);
    ctx.textAlign = 'left';
  }
  if (dateLine) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 14px ${FONT_FAMILY}`;
    ctx.textAlign = 'right';
    ctx.fillText(dateLine, cX + cW, orgValY);
    ctx.textAlign = 'left';
  }
  ctx.textBaseline = 'alphabetic';

  /* Divider 1 */
  const div1Y = orgValY + 30;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(cX, div1Y, cW, 1.5);

  /* Stats 2×2 */
  const statCols = [
    { label: 'Prize Pool', value: prize || '—' },
    { label: 'Entry Fee', value: entry || '—' },
    { label: 'Format', value: format || '—' },
    { label: 'Slots', value: slots || '—' }
  ];
  const colGap = 24;
  const colW = (cW - colGap) / 2;
  const colXs = [cX, cX + colW + colGap];

  const statY0 = div1Y + 24;
  const row1LabelY = statY0;
  const row1ValueY = statY0 + 30;
  const row2LabelY = row1ValueY + 50;
  const row2ValueY = row2LabelY + 30;

  statCols.forEach((stat, i) => {
    const col = Math.floor(i / 2);
    const row = i % 2;
    const x = colXs[col];
    const ly = row === 0 ? row1LabelY : row2LabelY;
    const vy = row === 0 ? row1ValueY : row2ValueY;

    ctx.fillStyle = MUTED;
    ctx.font = `600 12px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.letterSpacing = '2px';
    ctx.fillText(stat.label.toUpperCase(), x, ly);
    ctx.letterSpacing = '0px';

    ctx.font = `800 26px ${FONT_FAMILY}`;
    const size = fitFontSize(ctx, stat.value, FONT_FAMILY, 26, colW - 16, 15);
    ctx.fillStyle = stat.label === 'Prize Pool' ? GOLD : WHITE;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    ctx.fillText(stat.value, x, vy);
  });

  /* Divider 2 */
  const div2Y = row2ValueY + 26;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(cX, div2Y, cW, 1.5);

  /* Bottom brand bar */
  const footY = div2Y + 34;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3B82F6';
  ctx.font = `800 15px ${FONT_FAMILY}`;
  ctx.letterSpacing = '3px';
  ctx.fillText('MATCH DISTRICT', cX, footY);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = MUTED_90;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText('matchdistrict.in', cX + cW, footY);

  ctx.restore();

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