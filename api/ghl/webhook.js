// api/ghl/webhook.js
// Vercel Node serverless function (CommonJS). No external deps.

const crypto = require("crypto");

// read raw body (needed for signature verification)
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  // Health check / easy browser hit
  if (req.method !== "POST") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, method: req.method }));
    return;
  }

  const raw = await readRaw(req); // Buffer
  const secret = process.env.GHL_APP_SHARED_SECRET || "";

  // Common header names used by GHL/LeadConnector
  const signatureHeader =
    req.headers["x-leadconnector-signature"] ||
    req.headers["x-gohighlevel-signature"] ||
    req.headers["x-wh-signature"] ||
    req.headers["x-hub-signature-256"] ||
    req.headers["x-signature"];

  const tsHeader =
    req.headers["x-leadconnector-timestamp"] ||
    req.headers["x-gohighlevel-timestamp"] ||
    req.headers["x-wh-timestamp"] ||
    req.headers["x-timestamp"];

  // Normalize "sha256=<hex>" → "<hex>"
  let provided = null;
  if (signatureHeader) provided = String(signatureHeader).replace(/^sha256=/, "").trim();

  const hmacHex = (data) =>
    crypto.createHmac("sha256", secret).update(data).digest("hex");

  // compute both variants:
  // 1) body-only   => HMAC(raw)
  // 2) timestamped => HMAC(`${ts}.${raw}`)
  const expectedRaw = secret ? hmacHex(raw) : null;
  const expectedTS = secret && tsHeader ? hmacHex(`${tsHeader}.${raw}`) : null;

  let verified = false;
  try {
    if (provided && expectedRaw) {
      const p = Buffer.from(provided, "utf8");
      const a = Buffer.from(expectedRaw, "utf8");
      const b = expectedTS ? Buffer.from(expectedTS, "utf8") : null;
      verified = crypto.timingSafeEqual(p, a) || (b && crypto.timingSafeEqual(p, b));
    }
  } catch {
    verified = false;
  }

  // Try to parse JSON payload (don’t crash if it isn’t JSON)
  let payload = null;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {}

  // TODO: handle specific events here
  // if (verified && payload?.type === "payments.payment_succeeded") { ... }

  // Minimal logging (no secrets)
  try {
    console.log("ghl.webhook", {
      verified,
      hasSecret: Boolean(secret),
      headers: {
        lc_sig: !!req.headers["x-leadconnector-signature"],
        ghl_sig: !!req.headers["x-gohighlevel-signature"],
        wh_sig: !!req.headers["x-wh-signature"],
        ts: tsHeader || null,
      },
      type: payload?.type,
    });
  } catch {}

  const body = {
    received: true,
    verified,
    ...(process.env.WEBHOOK_DEBUG === "1"
      ? { debug: { provided, expectedRaw, expectedTS, tsHeader, type: payload?.type } }
      : {}),
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};
