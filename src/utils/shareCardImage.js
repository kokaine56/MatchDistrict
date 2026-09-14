const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1500;
const CORNER_RADIUS = 44;
const MX = 64;

const FONT_FAMILY = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';

const PRIMARY = { r: 59, g: 130, b: 246 };
const GOLD = '#FBBF24';
const WHITE = '#F1F5F9';
const MUTED = '#7C8AA0';
const MUTED_90 = 'rgba(148,163,184,0.9)';
const BLUE_SOFT = '#93C5FD';

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

function drawContainImage(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const boxA = w / h;
  const imgA = iw / ih;
  let dw;
  let dh;
  if (imgA > boxA) {
    dw = w;
    dh = w / imgA;
  } else {
    dh = h;
    dw = h * imgA;
  }
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
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
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    img.onload = () => {
      imageCache.set(url, img);
      done(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      imageCache.set(url, 'failed');
      done(null);
    };
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
      try {
        dateLine = d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      } catch {
        dateLine = '';
      }
    }
  }

  /* Rounded card canvas (transparent corners) */
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  drawRoundRectPath(ctx, 0, 0, W, H, CORNER_RADIUS);
  ctx.clip();

  /* Background */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0B1020');
  bg.addColorStop(0.62, '#0E1526');
  bg.addColorStop(1, '#0F172A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.06)`;
  for (let y = 12; y < H; y += 40) {
    for (let x = 12; x < W; x += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
  glow.addColorStop(0, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.16)`);
  glow.addColorStop(1, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  /* Top accent hairline */
  const accent = ctx.createLinearGradient(140, 0, W - 140, 0);
  accent.addColorStop(0, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0)`);
  accent.addColorStop(0.25, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.9)`);
  accent.addColorStop(0.75, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.9)`);
  accent.addColorStop(1, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0)`);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 14, W, 3);

  /* Brand row */
  drawRoundRectPath(ctx, MX, 52, 46, 46, 14);
  ctx.fillStyle = '#2563EB';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 25px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', MX + 23, 75);
  ctx.font = `bold 21px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '5px';
  ctx.fillStyle = '#EDF2F7';
  ctx.fillText('MATCH DISTRICT', MX + 66, 75);
  ctx.letterSpacing = '0px';

  const tagLabel = 'TOURNAMENT';
  ctx.font = `700 13px ${FONT_FAMILY}`;
  const tagW = ctx.measureText(tagLabel).width;
  const tagChipW = tagW + 60;
  const tagChipH = 36;
  const tagChipX = W - MX - tagChipW;
  const tagChipY = 57;
  drawRoundRectPath(ctx, tagChipX, tagChipY, tagChipW, tagChipH, tagChipH / 2);
  ctx.fillStyle = 'rgba(59,130,246,0.16)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(59,130,246,0.4)';
  ctx.stroke();
  ctx.fillStyle = BLUE_SOFT;
  ctx.font = `700 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.fillText(tagLabel, tagChipX + tagChipW / 2, tagChipY + tagChipH / 2 + 1);
  ctx.letterSpacing = '0px';

  /* Poster image window — 3:4 portrait, object-fit: contain */
  const imgW = 720;
  const imgH = 960;
  const imgX = (W - imgW) / 2;
  const imgY = 136;
  const imgBottom = imgY + imgH;

  const frameGrad = ctx.createLinearGradient(0, imgY, 0, imgBottom);
  frameGrad.addColorStop(0, '#0D1524');
  frameGrad.addColorStop(1, '#131C2E');
  ctx.fillStyle = frameGrad;
  drawRoundRectPath(ctx, imgX, imgY, imgW, imgH, 28);
  ctx.fill();

  const imgGlow = ctx.createRadialGradient(imgX + imgW / 2, imgY + imgH / 2, 40, imgX + imgW / 2, imgY + imgH / 2, imgW * 0.72);
  imgGlow.addColorStop(0, 'rgba(59,130,246,0.12)');
  imgGlow.addColorStop(1, 'rgba(59,130,246,0)');
  ctx.fillStyle = imgGlow;
  ctx.fillRect(imgX, imgY, imgW, imgH);

  const loadedImg = imageEl || peekShareCardImage(imageUrl);
  if (loadedImg) {
    ctx.save();
    drawRoundRectPath(ctx, imgX, imgY, imgW, imgH, 28);
    ctx.clip();
    drawContainImage(ctx, loadedImg, imgX, imgY, imgW, imgH);
    ctx.restore();
  } else {
    ctx.save();
    drawRoundRectPath(ctx, imgX, imgY, imgW, imgH, 28);
    ctx.clip();
    const fb = ctx.createLinearGradient(imgX, imgY, imgX, imgBottom);
    fb.addColorStop(0, '#1E3A8A');
    fb.addColorStop(1, '#2563EB');
    ctx.fillStyle = fb;
    ctx.fillRect(imgX, imgY, imgW, imgH);
    ctx.fillStyle = 'rgba(148,163,184,0.22)';
    ctx.font = `900 150px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MD', imgX + imgW / 2, imgY + imgH / 2 - 40);
    ctx.fillStyle = 'rgba(241,245,249,0.9)';
    ctx.font = `700 22px ${FONT_FAMILY}`;
    ctx.letterSpacing = '5px';
    ctx.fillText('TOURNAMENT POSTER', imgX + imgW / 2, imgY + imgH / 2 + 96);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(59,130,246,0.28)';
  drawRoundRectPath(ctx, imgX, imgY, imgW, imgH, 28);
  ctx.stroke();

  /* Game eyebrow */
  const eyebrow = game ? `${String(game).toUpperCase()}  •  TOURNAMENT` : 'TOURNAMENT';
  ctx.fillStyle = '#60A5FA';
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '3px';
  ctx.fillText(eyebrow, MX, imgBottom + 34);
  ctx.letterSpacing = '0px';

  /* Title */
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 52px ${FONT_FAMILY}`;
  const maxTitleW = W - 2 * MX;
  const titleLines = wrapText(ctx, title, maxTitleW, 2);
  const titleY0 = imgBottom + 60;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, MX, titleY0 + i * 62);
  });
  const twoLineTitle = titleLines.length === 2;

  /* Organizer + date row */
  const orgBaseline = twoLineTitle ? titleY0 + 62 + 34 : titleY0 + 40;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const orgLabel = orgName ? `BY ${String(orgName).toUpperCase()}` : '';
  if (orgLabel) {
    ctx.font = `600 16px ${FONT_FAMILY}`;
    const orgW = ctx.measureText(orgLabel).width;
    let orgX = MX;
    if (verified) {
      ctx.fillStyle = GOLD;
      drawStar(ctx, orgX + 12, orgBaseline + 1, 10, 4.2);
      orgX += 26;
    }
    ctx.fillStyle = '#C9D4E0';
    ctx.letterSpacing = '2px';
    ctx.fillText(orgLabel, orgX, orgBaseline);
    ctx.letterSpacing = '0px';
    if (orgW + orgX - MX > (W - 2 * MX) * 0.72 && dateLine) {
      dateLine = '';
    }
  }
  if (dateLine) {
    ctx.fillStyle = MUTED;
    ctx.font = `500 15px ${FONT_FAMILY}`;
    ctx.textAlign = 'right';
    ctx.fillText(dateLine, W - MX, orgBaseline);
    ctx.textAlign = 'left';
  }

  /* Stats 2×2 grid */
  const statCols = [
    { label: 'Prize Pool', value: prize || '—' },
    { label: 'Entry', value: entry || '—' },
    { label: 'Format', value: format || '—' },
    { label: 'Slots', value: slots || '—' }
  ];
  const colGap = 28;
  const colW = (W - 2 * MX - colGap) / 2;
  const colXs = [MX, MX + colW + colGap];
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const labelYRow1 = orgBaseline + 46;
  const valueYRow1 = labelYRow1 + 32;
  const labelYRow2 = valueYRow1 + 56;
  const valueYRow2 = labelYRow2 + 32;

  statCols.forEach((stat, i) => {
    const col = Math.floor(i / 2);
    const row = i % 2;
    const x = colXs[col];
    const labelY = row === 0 ? labelYRow1 : labelYRow2;
    const valueY = row === 0 ? valueYRow1 : valueYRow2;

    ctx.fillStyle = MUTED;
    ctx.font = `600 12px ${FONT_FAMILY}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(stat.label.toUpperCase(), x, labelY);
    ctx.letterSpacing = '0px';

    ctx.font = `800 26px ${FONT_FAMILY}`;
    const size = fitFontSize(ctx, stat.value, FONT_FAMILY, 26, colW - 16, 15);
    ctx.fillStyle = stat.label === 'Prize Pool' ? GOLD : WHITE;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    ctx.fillText(stat.value, x, valueY);
  });

  /* Divider */
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(MX, valueYRow2 + 34, W - 2 * MX, 1.5);

  /* Bottom brand bar */
  const footBaseline = valueYRow2 + 34 + 30;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3B82F6';
  ctx.font = `800 15px ${FONT_FAMILY}`;
  ctx.letterSpacing = '3px';
  ctx.fillText('MATCH DISTRICT', MX, footBaseline);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = MUTED_90;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText('matchdistrict.in', W - MX, footBaseline);
  ctx.textAlign = 'left';

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
  for (let i = 0; i < len; i++) {
    bytes[i] = b64.charCodeAt(i);
  }
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