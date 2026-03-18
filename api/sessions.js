// api/sessions.js
// Handles all session storage: list, get, save, delete
// Uses Upstash Redis via REST API (KV_REST_API_URL + KV_REST_API_TOKEN)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify password
  const { password, username } = req.body || req.query;
  const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
  if (ACCESS_PASSWORD && password !== ACCESS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  if (!username || username.trim().length < 1) {
    return res.status(400).json({ error: 'Username required' });
  }

  const user = username.trim().toLowerCase();
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  // Helper: call Upstash REST API
  async function kv(command, ...args) {
    const r = await fetch(`${KV_URL}/${[command, ...args].map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await r.json();
    return data.result;
  }

  async function kvPost(body) {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    return data.result;
  }

  const sessionsKey  = `user:${user}:sessions`;   // sorted set: score=updatedAt, member=sessionId
  const sessionPrefix = `user:${user}:session:`;  // session data keys

  // ── GET — list all sessions ──────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      // Get session IDs sorted by updatedAt desc
      const ids = await kv('ZREVRANGE', sessionsKey, '0', '49');
      if (!ids || ids.length === 0) return res.json({ sessions: [] });

      // Fetch all session data in one pipeline
      const pipeline = ids.map(id => ['GET', `${sessionPrefix}${id}`]);
      const r = await fetch(`${KV_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(pipeline)
      });
      const results = await r.json();
      const sessions = results
        .map(item => { try { return JSON.parse(item.result); } catch { return null; } })
        .filter(Boolean);

      return res.json({ sessions });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST — save/update a session ─────────────────────────────────────────
  if (req.method === 'POST') {
    const { session } = req.body;
    if (!session || !session.id) return res.status(400).json({ error: 'Session data required' });

    try {
      const key = `${sessionPrefix}${session.id}`;
      const score = session.updatedAt || Date.now();

      await kvPost([
        ['SET', key, JSON.stringify(session)],
        ['ZADD', sessionsKey, score, session.id]
      ].map(cmd => cmd));

      // Actually use pipeline
      await fetch(`${KV_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['SET', key, JSON.stringify(session)],
          ['ZADD', sessionsKey, String(score), session.id]
        ])
      });

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DELETE — remove a session ─────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    try {
      await fetch(`${KV_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['DEL', `${sessionPrefix}${sessionId}`],
          ['ZREM', sessionsKey, sessionId]
        ])
      });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
