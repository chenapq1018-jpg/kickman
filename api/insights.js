// /api/insights.js
// Kickman Knowledge Base — two separate systems:
//
// 1. QUALITATIVE INSIGHTS (anonymized learnings, no numbers)
//    kb:insight:{id}        → individual insight object
//    kb:cat:{category}      → list of insight IDs by category
//    kb:recent              → recency-ordered list of all IDs
//
// 2. BENCHMARK AGGREGATES (running averages per category, raw values NEVER stored)
//    kb:bm:{category}       → JSON with Welford running stats per metric
//    kb:bm:global           → cross-category global benchmarks
//
// Welford online algorithm: update mean without storing individual values
// Once a data point is aggregated, the original number is discarded forever.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) return res.status(500).json({ error: 'KV not configured' });

  const kvGet = async (key) => {
    const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    return (await r.json()).result;
  };
  const kvSet = async (key, value) => {
    await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  };
  const kvLPush = async (key, value) => {
    await fetch(`${KV_URL}/lpush/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  };
  const kvLRange = async (key, start, stop) => {
    const r = await fetch(`${KV_URL}/lrange/${encodeURIComponent(key)}/${start}/${stop}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    return (await r.json()).result || [];
  };
  const kvIncr = async (key) => {
    const r = await fetch(`${KV_URL}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    return (await r.json()).result;
  };

  // Welford's online algorithm — updates running mean without storing raw values
  function welfordUpdate(stat, newValue) {
    if (newValue === null || newValue === undefined || isNaN(newValue)) return stat;
    const s = stat || { n: 0, mean: 0, m2: 0 };
    const n = s.n + 1;
    const delta = newValue - s.mean;
    const mean = s.mean + delta / n;
    const m2 = s.m2 + delta * (newValue - mean);
    return { n, mean, m2 };
  }

  function welfordResult(stat) {
    if (!stat || stat.n < 1) return null;
    const variance = stat.n > 1 ? stat.m2 / (stat.n - 1) : 0;
    return {
      n: stat.n,
      mean: Math.round(stat.mean * 100) / 100,
      stddev: Math.round(Math.sqrt(variance) * 100) / 100,
      confidence: stat.n < 5 ? 'low' : stat.n < 20 ? 'medium' : 'high'
    };
  }

  const CATEGORY_LABELS = {
    'robotics': 'Robotics & Automation', 'ai-hardware': 'AI Hardware',
    'pet-tech': 'Pet Tech', 'health-fitness': 'Health & Fitness',
    'smart-home': 'Smart Home', 'camera': 'Camera', 'gaming': 'Gaming',
    'accessories': 'Accessories', 'audio': 'Audio', 'kitchen': 'Kitchen', 'general': 'General Hardware'
  };

  // GET /api/insights?type=both&category=X&limit=3
  if (req.method === 'GET') {
    const { type = 'both', category = 'general', limit = 3 } = req.query;
    const result = {};
    try {
      if (type === 'benchmarks' || type === 'both') {
        const [catRaw, globalRaw] = await Promise.all([kvGet(`kb:bm:${category}`), kvGet('kb:bm:global')]);
        const catBm = catRaw ? JSON.parse(catRaw) : {};
        const globalBm = globalRaw ? JSON.parse(globalRaw) : {};
        const metrics = ['cpl', 'cvr', 'ctr', 'emailCount', 'ksFunding', 'ksBackers', 'ksPrice'];
        const fmt = (bm) => { const r = {}; metrics.forEach(m => { if (bm[m]) r[m] = welfordResult(bm[m]); }); return r; };
        result.benchmarks = { category, label: CATEGORY_LABELS[category] || category, categoryStats: fmt(catBm), globalStats: fmt(globalBm) };
      }
      if (type === 'insights' || type === 'both') {
        const ids = await kvLRange(`kb:cat:${category}`, 0, parseInt(limit) - 1);
        const insights = await Promise.all(ids.map(async id => {
          const raw = await kvGet(`kb:insight:${id}`);
          if (!raw) return null;
          try { return JSON.parse(raw); } catch { return null; }
        }));
        result.insights = insights.filter(Boolean);
      }
      return res.status(200).json(result);
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // POST /api/insights — two subtypes: benchmark | insight
  if (req.method === 'POST') {
    const { password, type = 'insight', category = 'general', insight, metrics } = req.body;
    if (ACCESS_PASSWORD && password !== ACCESS_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });

    // BENCHMARK: aggregate numerical metrics, raw values discarded immediately after update
    if (type === 'benchmark' && metrics) {
      try {
        const validMetrics = ['cpl', 'cvr', 'ctr', 'emailCount', 'ksFunding', 'ksBackers', 'ksPrice'];
        const [catRaw, globalRaw] = await Promise.all([kvGet(`kb:bm:${category}`), kvGet('kb:bm:global')]);
        const catBm = catRaw ? JSON.parse(catRaw) : {};
        const globalBm = globalRaw ? JSON.parse(globalRaw) : {};
        validMetrics.forEach(metric => {
          if (metrics[metric] !== undefined) {
            const val = parseFloat(metrics[metric]);
            if (!isNaN(val) && val >= 0) {
              catBm[metric] = welfordUpdate(catBm[metric], val);
              globalBm[metric] = welfordUpdate(globalBm[metric], val);
            }
          }
        });
        await Promise.all([kvSet(`kb:bm:${category}`, JSON.stringify(catBm)), kvSet('kb:bm:global', JSON.stringify(globalBm))]);
        return res.status(200).json({ stored: true, category });
      } catch (err) { return res.status(500).json({ error: err.message }); }
    }

    // QUALITATIVE INSIGHT: strip all numbers before storing
    if (type === 'insight' && insight) {
      try {
        const count = await kvIncr('kb:counter');
        const id = `ins_${Date.now()}_${count}`;
        const safe = {
          id, createdAt: Date.now(), category,
          priceRange: insight.priceRange || '', verdict: insight.verdict || '', mission: insight.mission || 1,
          headline: insight.headline || '', whatWorked: insight.whatWorked || '',
          whatFailed: insight.whatFailed || '', keyTakeaway: insight.keyTakeaway || '',
          campaignRef: insight.campaignRef || ''
        };
        // Hard sanitize: remove any numbers that slipped through
        ['headline', 'whatWorked', 'whatFailed', 'keyTakeaway'].forEach(f => {
          if (safe[f]) safe[f] = safe[f].replace(/\$[\d,]+|\b\d+\.?\d*%|\b\d{3,}\b/g, '[X]');
        });
        await kvSet(`kb:insight:${id}`, JSON.stringify(safe));
        await kvLPush(`kb:cat:${category}`, id);
        await kvLPush('kb:recent', id);
        await fetch(`${KV_URL}/ltrim/${encodeURIComponent('kb:recent')}/0/199`, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` } });
        return res.status(200).json({ id, stored: true });
      } catch (err) { return res.status(500).json({ error: err.message }); }
    }

    return res.status(400).json({ error: 'Invalid request' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
