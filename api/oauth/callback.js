// api/oauth/callback.js
import axios from "axios";

/**
 * GET /api/oauth/callback
 * Exchanges GoHighLevel ?code= for access/refresh tokens.
 * Make sure these env vars are set in Vercel (Production):
 * - GHL_CLIENT_ID
 * - GHL_CLIENT_SECRET
 * - OAUTH_REDIRECT_URI (must EXACTLY match the redirect you use in GHL + install URL)
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }

    const { code, error, error_description } = req.query || {};
    if (error) return res.status(400).send(`OAuth error: ${error_description || error}`);
    if (!code) return res.status(400).send("Missing ?code");

    // IMPORTANT: use application/x-www-form-urlencoded (not JSON)
    const body = new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.OAUTH_REDIRECT_URI
    });

    const tokenResp = await axios.post(
      "https://services.leadconnectorhq.com/oauth/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000 }
    );

    const data = tokenResp.data || {};
    const locId = data.locationId;

    // TODO: persist tokens securely keyed by locId (DB/KV)
    console.log("Connected location:", locId);
    console.log("Access token (last6):", (data.access_token || "").slice(-6));

    return res.status(200).send("Sunflower Casita connected 🎉 You can close this tab.");
  } catch (e) {
    console.error("OAuth exchange failed:", e?.response?.status, e?.response?.data || e.message);
    return res.status(500).send("OAuth exchange failed");
  }
}
