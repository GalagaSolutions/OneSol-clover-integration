import axios from "axios";

/**
 * GET /oauth/callback
 * Exchanges GoHighLevel ?code= for access/refresh tokens.
 * ENV in Vercel: GHL_CLIENT_ID, GHL_CLIENT_SECRET, OAUTH_REDIRECT_URI
 */
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }
    const { code, locationId, error, error_description } = req.query || {};
    if (error) return res.status(400).send(`OAuth error: ${error_description || error}`);
    if (!code) return res.status(400).send("Missing ?code");

    const r = await axios.post(
      "https://services.leadconnectorhq.com/oauth/token",
      {
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        user_type: "Company",
        redirect_uri: process.env.OAUTH_REDIRECT_URI
      },
      { headers: { "Content-Type": "application/json" }, timeout: 20000 }
    );

    const data = r.data || {};
    const locId = locationId || data.locationId;

    // TODO: save tokens securely keyed by locId (DB/KV)
    console.log("Connected location:", locId);
    console.log("Access token (last6):", (data.access_token || "").slice(-6));

    return res.status(200).send("Sunflower Casita connected 🎉 You can close this tab.");
  } catch (e) {
    console.error("OAuth exchange failed:", e?.response?.data || e.message);
    return res.status(500).send("OAuth exchange failed");
  }
}
