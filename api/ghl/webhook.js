import crypto from 'node:crypto';

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, method: req.method }));
    return;
  }

  const raw = await readRaw(req);
  const text = raw.toString('utf8');

  const secret = process.env.GHL_APP_SHARED_SECRET || '';
  const sigHeader =
    req.headers['x-leadconnector-signature'] ||
    req.headers['x-gohighlevel-signature'] ||
    req.headers['x-hub-signature-256'] ||
    req.headers['x-signature'];

  let verified = false;
  if (secret && sigHeader) {
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const provided = String(sigHeader).replace(/^sha256=/, '').trim();
    try {
      verified = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
    } catch {
      verified = false;
    }
  }

  let payload = null;
  try { payload = JSON.parse(text); } catch {}

  console.log('GHL webhook', {
    verified,
    headers: {
      lc: req.headers['x-leadconnector-signature'],
      ghl: req.headers['x-gohighlevel-signature'],
      hub: req.headers['x-hub-signature-256'],
    },
    payload,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ received: true, verified }));
}
