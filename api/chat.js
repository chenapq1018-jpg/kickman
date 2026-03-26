export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, system, password, max_tokens } = req.body;

  const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
  if (ACCESS_PASSWORD && password !== ACCESS_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const callAPI = async () => {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 2048,
        system,
        messages,
      }),
    });
  };

  try {
    let response = await callAPI();

    // Auto-retry once on overload (529) with 3s delay
    if (response.status === 529) {
      await new Promise(r => setTimeout(r, 3000));
      response = await callAPI();
    }

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error?.message || 'API error';
      // Return friendly overload message
      if (response.status === 529) {
        return res.status(529).json({ error: 'Kickman is very busy right now. Please try again in a moment.' });
      }
      return res.status(response.status).json({ error: errMsg });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
