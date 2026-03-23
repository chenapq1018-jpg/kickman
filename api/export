// api/export.js
// Generates .docx files from step data
// Returns base64-encoded file content

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
         LevelFormat, PageBreak, BorderStyle } from 'docx';

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
    const base64 = buffer.toString('base64');
    return res.status(200).json({ base64, filename: getFilename(type, projectName) });
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Export failed: ' + err.message });
  }
}

function getFilename(type, projectName) {
  const slug = (projectName || 'kickman').slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  const labels = {
    alignment: 'product-alignment',
    timeline: 'campaign-timeline',
    chat: 'conversation',
    full: 'full-export',
  };
  return `kickman-${labels[type] || type}-${slug}-${date}.docx`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, bold: true, size: 32, font: 'Arial', color: 'E8622A' })],
    spacing: { before: 360, after: 120 },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial', color: '333333' })],
    spacing: { before: 280, after: 80 },
  });
}

function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, font: 'Courier New', color: 'E8622A', characterSpacing: 40 })],
    spacing: { before: 240, after: 60 },
  });
}

function body(text, opts = {}) {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).map(line => {
    const clean = line.replace(/^[•\-\*] /, '').replace(/^"\s*/, '').replace(/\s*"$/, '');
    const isBullet = /^[•\-\*] /.test(line) || /^"/.test(line.trim());
    if (isBullet) {
      return new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        children: [new TextRun({ text: clean, size: 22, font: 'Arial', color: '222222' })],
        spacing: { before: 40, after: 40 },
      });
    }
    return new Paragraph({
      children: [new TextRun({ text: line, size: 22, font: 'Arial', color: '333333', ...opts })],
      spacing: { before: opts.before || 0, after: opts.after || 80 },
    });
  });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E8E0D8', space: 1 } },
    spacing: { before: 160, after: 160 },
    children: [],
  });
}

function meta(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 18, font: 'Courier New', color: '888888' })],
    spacing: { before: 0, after: 40 },
  });
}

function label(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), size: 16, font: 'Courier New', color: 'AAAAAA', characterSpacing: 30 })],
    spacing: { before: 200, after: 40 },
  });
}

function empty() { return new Paragraph({ children: [new TextRun('')], spacing: { before: 80, after: 80 } }); }

// ── Document builders ─────────────────────────────────────────────────────────
async function generateDocx(type, data, projectName) {
  const now = new Date().toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  let sections;

  if (type === 'alignment') sections = buildAlignmentDoc(data, projectName, now);
  else if (type === 'timeline') sections = buildTimelineDoc(data, projectName, now);
  else if (type === 'chat') sections = buildChatDoc(data, projectName, now);
  else if (type === 'full') sections = buildFullDoc(data, projectName, now);
  else throw new Error('Unknown export type: ' + type);

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial', color: 'E8622A' },
          paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, font: 'Arial', color: '333333' },
          paragraph: { spacing: { before: 280, after: 80 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: sections,
    }],
  });

  return await Packer.toBuffer(doc);
}

function buildAlignmentDoc(a, projectName, now) {
  const children = [
    h1('Product Alignment Document'),
    meta('Project: ' + (projectName || 'Untitled')),
    meta('Generated by Kickman · kickman.org'),
    meta('Last updated: ' + now),
    divider(),
  ];

  const section = (num, title, content) => {
    children.push(h3(num + '. ' + title));
    if (Array.isArray(content)) {
      content.forEach(line => children.push(...body('• ' + line)));
    } else if (content) {
      children.push(...body(content));
    }
    children.push(empty());
  };

  section('01', 'Product Name & Definition',
    (a.productName || '') + (a.definition ? '\n' + a.definition : ''));
  section('02', 'Internal Description', a.internalDescription || '');
  section('03', 'All Features', a.features || []);
  section('04', 'Benefits', a.benefits || []);

  children.push(h3('05. What Backers Might Think or Feel — Resistance Map'));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Doubts and fears to preempt throughout the campaign:', size: 18, font: 'Arial', color: '888888', italics: true })],
    spacing: { before: 0, after: 80 },
  }));
  const neg = Array.isArray(a.negativeThoughts) ? a.negativeThoughts : (a.negativeThoughts || '').split('\n').filter(Boolean);
  neg.forEach(t => children.push(...body('• "' + t.replace(/^[""]/, '').replace(/[""]$/, '') + '"')));
  children.push(empty());

  children.push(h3('06. What We Want People to Think and Feel — Emotional Destination'));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'What a converted backer feels when they click Back:', size: 18, font: 'Arial', color: '888888', italics: true })],
    spacing: { before: 0, after: 80 },
  }));
  const pos = Array.isArray(a.emotionalDestination) ? a.emotionalDestination : (a.emotionalDestination || '').split('\n').filter(Boolean);
  pos.forEach(t => children.push(...body('• "' + t.replace(/^[""]/, '').replace(/[""]$/, '') + '"')));
  children.push(empty());

  if (a.readinessScore) {
    children.push(h3('Readiness Score'));
    children.push(...body(String(a.readinessScore) + '/10'));
    if (a.readinessNotes) children.push(...body(a.readinessNotes, { italics: true, color: '666666' }));
  }

  children.push(divider());
  children.push(meta('This document was generated by Kickman — your crowdfunding coach.'));
  children.push(meta('Update it anytime by telling Kickman about changes to your product.'));

  return children;
}

function buildTimelineDoc(tl, projectName, now) {
  const children = [
    h1('Campaign Timeline'),
    meta('Project: ' + (projectName || 'Untitled')),
    meta('Generated by Kickman · kickman.org · ' + now),
    divider(),
  ];

  const riskColors = { low: '2D9E6B', medium: 'D4A017', high: 'C0392B' };
  const statusLabel = { done: '✓ Done', active: '→ Active', pending: '○ Pending' };

  (tl || []).forEach((ms, i) => {
    const color = riskColors[ms.risk] || '888888';
    const risk = ms.risk ? ms.risk.charAt(0).toUpperCase() + ms.risk.slice(1) + ' Risk' : '';
    children.push(new Paragraph({
      children: [
        new TextRun({ text: String(i + 1).padStart(2, '0') + '. ', bold: true, size: 24, font: 'Arial', color: 'E8622A' }),
        new TextRun({ text: ms.name, bold: true, size: 24, font: 'Arial', color: '111111' }),
      ],
      spacing: { before: 280, after: 60 },
    }));
    children.push(new Paragraph({
      children: [
        new TextRun({ text: 'Date: ', bold: true, size: 20, font: 'Arial', color: '555555' }),
        new TextRun({ text: ms.date || 'TBD', size: 20, font: 'Arial', color: '333333' }),
        new TextRun({ text: '   Status: ', bold: true, size: 20, font: 'Arial', color: '555555' }),
        new TextRun({ text: statusLabel[ms.status] || '○ Pending', size: 20, font: 'Arial', color: '333333' }),
        ...(risk ? [
          new TextRun({ text: '   Risk: ', bold: true, size: 20, font: 'Arial', color: '555555' }),
          new TextRun({ text: risk, bold: true, size: 20, font: 'Arial', color }),
        ] : []),
      ],
      spacing: { before: 0, after: 60 },
    }));
    if (ms.hint) {
      children.push(new Paragraph({
        children: [new TextRun({ text: ms.hint, size: 18, font: 'Arial', color: '888888', italics: true })],
        spacing: { before: 0, after: 80 },
      }));
    }
    ms.subtasks.forEach(st => {
      const icon = st.status === 'done' ? '✓' : st.status === 'active' ? '→' : '○';
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        children: [
          new TextRun({ text: icon + ' ' + st.name + '  —  ' + (st.date || 'TBD'), size: 20, font: 'Arial', color: st.status === 'done' ? '2D9E6B' : '555555' }),
        ],
        spacing: { before: 20, after: 20 },
      }));
    });
  });

  children.push(divider());
  children.push(meta('kickman.org'));
  return children;
}

function buildChatDoc(history, projectName, now) {
  const children = [
    h1('Conversation History'),
    meta('Project: ' + (projectName || 'Untitled')),
    meta('Exported: ' + now + ' · kickman.org'),
    divider(),
  ];

  (history || []).filter(m => m.content !== 'Begin.').forEach(m => {
    const role = m.role === 'km' ? 'Kickman' : 'You';
    const isKm = m.role === 'km';
    const text = typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || '');
    const clean = text.replace(/<!--[\s\S]*?-->/g, '').trim();

    children.push(new Paragraph({
      children: [new TextRun({ text: role.toUpperCase(), bold: true, size: 18, font: 'Courier New', color: isKm ? 'E8622A' : '333333', characterSpacing: 30 })],
      spacing: { before: 200, after: 40 },
    }));

    clean.split('\n').filter(l => l.trim()).forEach(line => {
      const isBold = line.startsWith('**') && line.includes('**');
      const cleaned = line.replace(/\*\*/g, '').replace(/^[#]+ /, '');
      children.push(new Paragraph({
        children: [new TextRun({ text: cleaned, size: 22, font: 'Arial', color: isKm ? '1A1A1A' : '444444', bold: isBold })],
        spacing: { before: 20, after: 40 },
      }));
    });

    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE', space: 1 } },
      spacing: { before: 100, after: 100 },
      children: [],
    }));
  });

  return children;
}

function buildFullDoc(data, projectName, now) {
  const { alignment, timeline, history } = data;
  const children = [
    h1('Kickman — Complete Project Export'),
    meta('Project: ' + (projectName || 'Untitled')),
    meta('Exported: ' + now + ' · kickman.org'),
    divider(),
    h2('Section 1 — Product Alignment'),
    ...buildAlignmentDoc(alignment || {}, projectName, now),
    new Paragraph({ children: [new PageBreak()] }),
    h2('Section 2 — Campaign Timeline'),
    ...buildTimelineDoc(timeline || [], projectName, now),
    new Paragraph({ children: [new PageBreak()] }),
    h2('Section 3 — Conversation History'),
    ...buildChatDoc(history || [], projectName, now),
  ];
  return children;
}
