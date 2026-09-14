const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const FONT_FAMILY = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';

const PRIMARY = { r: 59, g: 130, b: 246 };
const GOLD = '#FBBF24';
const WHITE = '#F1F5F9';
const MUTED = '#64748B';
const MUTED_90 = 'rgba(148,163,184,0.9)';

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

function fitFontSize(ctx, text, family, baseSize, maxWidth, maxSize) {
  let size = baseSize;
  while (size > maxSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `800 ${size}px ${family}`;
  }
  return size;
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const boxA = w / h;
  const imgA = iw / ih;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (imgA > boxA) {
    sw = ih * boxA;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / boxA;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
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
  imageUrl = '',
  imageEl = null
}) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  /* Background */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0B1020');
  bg.addColorStop(1, '#0F172A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.08)`;
  for (let y = 10; y < H; y += 36) {
    for (let x = 10; x < W; x += 36) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 620);
  glow.addColorStop(0, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.20)`);
  glow.addColorStop(1, `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  /* Brand row */
  drawRoundRectPath(ctx, 44, 20, 44, 44, 12);
  ctx.fillStyle = '#2563EB';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 25px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '0px';
  ctx.fillText('M', 66, 43);

  ctx.fillStyle = '#EDF2F7';
  ctx.font = `bold 21px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '5px';
  ctx.fillText('MATCH DISTRICT', 102, 42);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = MUTED_90;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.letterSpacing = '3px';
  ctx.fillText('TOURNAMENT SHARE CARD', W - 44, 42);
  ctx.letterSpacing = '0px';

  /* Banner image */
  const imgX = 44;
  const imgY = 92;
  const imgW = W - 88;
  const imgH = 300;
  ctx.save();
  drawRoundRectPath(ctx, imgX, imgY, imgW, imgH, 18);
  ctx.clip();
  const loadedImg = imageEl || peekShareCardImage(imageUrl);
  if (loadedImg) {
    drawCoverImage(ctx, loadedImg, imgX, imgY, imgW, imgH);
    const shade = ctx.createLinearGradient(0, imgY + imgH * 0.55, 0, imgY + imgH);
    shade.addColorStop(0, 'rgba(7,8,12,0)');
    shade.addColorStop(1, 'rgba(7,8,12,0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(imgX, imgY, imgW, imgH);
  } else {
    const fb = ctx.createLinearGradient(imgX, imgY, imgX + imgW, imgY + imgH);
    fb.addColorStop(0, '#1E3A8A');
    fb.addColorStop(1, '#2563EB');
    ctx.fillStyle = fb;
    ctx.fillRect(imgX, imgY, imgW, imgH);
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    ctx.font = `900 120px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MD', imgX + imgW / 2, imgY + imgH / 2 - 8);
    ctx.fillStyle = 'rgba(241,245,249,0.85)';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.letterSpacing = '4px';
    ctx.fillText('TOURNAMENT COVER', imgX + imgW / 2, imgY + imgH / 2 + 64);
    ctx.letterSpacing = '0px';
  }
  ctx.restore();

  /* Game chip */
  if (game) {
    const label = String(game).toUpperCase();
    ctx.font = `700 13px ${FONT_FAMILY}`;
    const tw = ctx.measureText(label).width;
    const cw = tw + 36;
    const ch = 30;
    drawRoundRectPath(ctx, 62, 110, cw, ch, ch / 2);
    ctx.fillStyle = 'rgba(2,6,23,0.62)';
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '1.5px';
    ctx.fillText(label, 80, 126);
    ctx.letterSpacing = '0px';
  }

  /* Title */
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 50px ${FONT_FAMILY}`;
  const maxTitleW = W - 88;
  const lines = wrapText(ctx, title, maxTitleW, 2);
  lines.forEach((line, i) => {
    ctx.fillText(line, 44, 428 + i * 60);
  });

  /* Stats */
  const statCols = [
    { label: 'Prize Pool', value: prize },
    { label: 'Entry', value: entry },
    { label: 'Format', value: format },
    { label: 'Slots', value: slots }
  ];
  const colW = (W - 88) / 4;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  statCols.forEach((stat, i) => {
    const x = 44 + i * colW;
    ctx.fillStyle = MUTED;
    ctx.font = `600 13px ${FONT_FAMILY}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(stat.label.toUpperCase(), x + 6, 516);
    ctx.letterSpacing = '0px';

    let value = stat.value || '—';
    let size = stat.label === 'Prize Pool' ? 32 : 30;
    if (stat.label === 'Format') value = value.length > 14 ? value : value;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    size = fitFontSize(ctx, value, FONT_FAMILY, size, colW - 16, 18);
    ctx.fillStyle = stat.label === 'Prize Pool' ? GOLD : WHITE;
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x + 6, 556);
    ctx.textBaseline = 'bottom';
  });

  /* Divider */
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(44, 592, W - 88, 1.5);

  /* Bottom brand bar */
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(59,130,246,1)';
  ctx.font = `800 15px ${FONT_FAMILY}`;
  ctx.letterSpacing = '3px';
  ctx.fillText('MATCH DISTRICT', 44, 619);
  ctx.letterSpacing = '0px';

  if (orgName) {
    ctx.fillStyle = MUTED_90;
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(orgName).toUpperCase(), W / 2, 619);
  }

  ctx.fillStyle = MUTED_90;
  ctx.font = `600 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.fillText('matchdistrict.in', W - 44, 619);

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