// api/export.js
import { Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, BorderStyle } from 'docx';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password, type, data, projectName } = req.body;
  const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
  if (ACCESS_PASSWORD && password !== ACCESS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  try {
    const buffer = await generateDocx(type, data, projectName);
    return res.status(200).json({ base64: buffer.toString('base64'), filename: getFilename(type, projectName) });
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Export failed: ' + err.message });
  }
}

function getFilename(type, projectName) {
  const slug = (projectName || 'kickman').slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  const labels = { alignment: 'product-alignment', timeline: 'campaign-timeline', chat: 'conversation', full: 'full-export' };
  return `kickman-${labels[type] || type}-${slug}-${date}.docx`;
}

const FONT = 'Arial Unicode MS';
const FONT_MONO = 'Courier New';

function safe(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(x => String(x)).join('\n');
  return String(v);
}

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => safe(x)).filter(Boolean);
  return safe(v).split('\n').map(s => s.trim()).filter(Boolean);
}

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text: safe(text), bold: true, size: 36, font: FONT, color: 'E8622A' })],
    spacing: { before: 0, after: 200 },
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text: safe(text), bold: true, size: 28, font: FONT, color: '222222' })],
    spacing: { before: 320, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E8622A', space: 4 } },
  });
}

function secTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text: safe(text).toUpperCase(), bold: true, size: 18, font: FONT_MONO, color: 'E8622A', characterSpacing: 30 })],
    spacing: { before: 280, after: 80 },
  });
}

function bodyP(text, bold, italic, color) {
  const t = safe(text).trim();
  if (!t) return null;
  return new Paragraph({
    children: [new TextRun({ text: t, size: 22, font: FONT, color: color || '333333', bold: !!bold, italics: !!italic })],
    spacing: { before: 20, after: 60 },
  });
}

function bulletP(text) {
  const t = safe(text).replace(/^[""\u201c\u201d]/, '').replace(/[""\u201c\u201d]$/, '').replace(/^[•\-\*]\s*/, '').trim();
  if (!t) return null;
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text: t, size: 22, font: FONT, color: '222222' })],
    spacing: { before: 30, after: 30 },
  });
}

function metaP(text) {
  return new Paragraph({
    children: [new TextRun({ text: safe(text), size: 18, font: FONT_MONO, color: '999999' })],
    spacing: { before: 0, after: 40 },
  });
}

function divP() {
  return new Paragraph({
    children: [new TextRun('')],
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
    spacing: { before: 200, after: 200 },
  });
}

function emptyP() {
  return new Paragraph({ children: [new TextRun('')], spacing: { before: 60, after: 60 } });
}

function makeDoc(children) {
  return new Document({
    numbering: {
      config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }],
    },
    styles: { default: { document: { run: { font: FONT, size: 22, color: '333333' } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: children.filter(Boolean) }],
  });
}

async function generateDocx(type, data, projectName) {
  const now = new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  let ch;
  if (type === 'alignment') ch = alignDoc(data, projectName, now);
  else if (type === 'timeline') ch = timelineDoc(Array.isArray(data) ? data : (data.timeline || []), projectName, now);
  else if (type === 'chat') ch = chatDoc(Array.isArray(data) ? data : (data.history || []), projectName, now);
  else if (type === 'full') ch = fullDoc(data, projectName, now);
  else throw new Error('Unknown type: ' + type);
  return Packer.toBuffer(makeDoc(ch));
}

function alignDoc(a, projectName, now) {
  if (!a) a = {};
  const ch = [
    h1('Product Alignment Document'),
    metaP('Project: ' + (projectName || 'Untitled')),
    metaP('Generated by Kickman · kickman.org · ' + now),
    divP(),
  ];

  ch.push(secTitle('01 · Product Name & Definition'));
  if (a.productName) ch.push(bodyP(a.productName, true));
  if (a.definition) ch.push(bodyP(a.definition));
  ch.push(emptyP());

  ch.push(secTitle('02 · Internal Description'));
  safe(a.internalDescription).split('\n').forEach(line => { const p = bodyP(line); if (p) ch.push(p); });
  ch.push(emptyP());

  ch.push(secTitle('03 · All Features'));
  toArray(a.features).forEach(item => { const p = bulletP(item); if (p) ch.push(p); });
  ch.push(emptyP());

  ch.push(secTitle('04 · Benefits'));
  toArray(a.benefits).forEach(item => { const p = bulletP(item); if (p) ch.push(p); });
  ch.push(emptyP());

  ch.push(secTitle('05 · What Backers Might Think or Feel — Resistance Map'));
  ch.push(bodyP('Doubts and fears to preempt throughout the entire campaign:', false, true, '888888'));
  toArray(a.negativeThoughts).forEach(t => {
    const clean = safe(t).replace(/^[""\u201c\u201d]/, '').replace(/[""\u201c\u201d]$/, '').trim();
    if (clean) ch.push(bulletP('"' + clean + '"'));
  });
  ch.push(emptyP());

  ch.push(secTitle('06 · What We Want People to Think and Feel — Emotional Destination'));
  ch.push(bodyP('What a converted backer feels when they click Back:', false, true, '888888'));
  toArray(a.emotionalDestination).forEach(t => {
    const clean = safe(t).replace(/^[""\u201c\u201d]/, '').replace(/[""\u201c\u201d]$/, '').trim();
    if (clean) ch.push(bulletP('"' + clean + '"'));
  });
  ch.push(emptyP());

  if (a.readinessScore) {
    ch.push(secTitle('Readiness Score'));
    const score = safe(a.readinessScore);
    ch.push(bodyP(score + (score.includes('/') ? '' : '/10'), true));
    if (a.readinessNotes) ch.push(bodyP(a.readinessNotes, false, true, '666666'));
    ch.push(emptyP());
  }

  ch.push(divP());
  ch.push(metaP('Generated by Kickman — kickman.org'));
  return ch;
}

function timelineDoc(tl, projectName, now) {
  const ch = [h1('Campaign Timeline'), metaP('Project: ' + (projectName || 'Untitled')), metaP('Exported: ' + now + ' · kickman.org'), divP()];
  const riskColor = { low: '2D9E6B', medium: 'C8860A', high: 'C0392B' };
  const statusLabel = { done: '✓ Done', active: '→ Active', pending: '○ Pending' };
  (tl || []).forEach((ms, i) => {
    const color = riskColor[ms.risk] || '888888';
    const risk = ms.risk ? ms.risk.charAt(0).toUpperCase() + ms.risk.slice(1) + ' Risk' : '';
    ch.push(new Paragraph({
      children: [
        new TextRun({ text: String(i + 1).padStart(2, '0') + '. ', bold: true, size: 26, font: FONT, color: 'E8622A' }),
        new TextRun({ text: safe(ms.name), bold: true, size: 26, font: FONT, color: '111111' }),
      ],
      spacing: { before: 280, after: 60 },
    }));
    ch.push(new Paragraph({
      children: [
        new TextRun({ text: 'Date: ', bold: true, size: 20, font: FONT, color: '555555' }),
        new TextRun({ text: (ms.date || 'TBD') + '   ', size: 20, font: FONT, color: '333333' }),
        new TextRun({ text: 'Status: ', bold: true, size: 20, font: FONT, color: '555555' }),
        new TextRun({ text: (statusLabel[ms.status] || '○ Pending') + '   ', size: 20, font: FONT, color: '333333' }),
        ...(risk ? [new TextRun({ text: 'Risk: ', bold: true, size: 20, font: FONT, color: '555555' }), new TextRun({ text: risk, bold: true, size: 20, font: FONT, color })] : []),
      ],
      spacing: { before: 0, after: 60 },
    }));
    (ms.subtasks || []).forEach(st => {
      const icon = st.status === 'done' ? '✓' : st.status === 'active' ? '→' : '○';
      ch.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        children: [new TextRun({ text: icon + ' ' + safe(st.name) + '  —  ' + (st.date || 'TBD'), size: 20, font: FONT, color: st.status === 'done' ? '2D9E6B' : '666666' })],
        spacing: { before: 20, after: 20 },
      }));
    });
    ch.push(emptyP());
  });
  ch.push(divP());
  ch.push(metaP('kickman.org'));
  return ch;
}

function chatDoc(history, projectName, now) {
  const ch = [h1('Conversation History'), metaP('Project: ' + (projectName || 'Untitled')), metaP('Exported: ' + now + ' · kickman.org'), divP()];
  (history || []).filter(m => m.content !== 'Begin.').forEach(m => {
    const isKm = m.role === 'km' || m.role === 'assistant';
    const role = isKm ? 'KICKMAN' : 'YOU';
    const text = typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || '');
    const clean = text.replace(/<!--[\s\S]*?-->/g, '').trim();
    ch.push(new Paragraph({
      children: [new TextRun({ text: role, bold: true, size: 18, font: FONT_MONO, color: isKm ? 'E8622A' : '333333', characterSpacing: 30 })],
      spacing: { before: 240, after: 60 },
    }));
    clean.split('\n').forEach(line => {
      const t = line.trim(); if (!t) return;
      const isBold = t.startsWith('**') || t.startsWith('## ');
      const cleaned = t.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^#+\s*/, '');
      ch.push(new Paragraph({
        children: [new TextRun({ text: cleaned, size: 21, font: FONT, color: isKm ? '1A1A1A' : '444444', bold: isBold })],
        spacing: { before: 20, after: 30 },
      }));
    });
    ch.push(new Paragraph({ children: [new TextRun('')], border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE', space: 1 } }, spacing: { before: 100, after: 100 } }));
  });
  return ch;
}

function fullDoc(data, projectName, now) {
  return [
    ...alignDoc(data.alignment || {}, projectName, now),
    new Paragraph({ children: [new TextRun({ text: '', size: 22 })], pageBreakBefore: true }),
    h2('Campaign Timeline'),
    ...timelineDoc(data.timeline || [], projectName, now),
    new Paragraph({ children: [new TextRun({ text: '', size: 22 })], pageBreakBefore: true }),
    h2('Conversation History'),
    ...chatDoc(data.history || [], projectName, now),
  ];
}
