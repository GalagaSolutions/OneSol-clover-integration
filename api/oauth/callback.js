// api/oauth/callback.js
import axios from "axios";

/**
 * Exchanges GHL ?code= for access/refresh tokens.
 * Make sure these env vars (Production) are set & correct:
 * - GHL_CLIENT_ID
 * - GHL_CLIENT_SECRET  (ROTATED, current)
 * - OAUTH_REDIRECT_URI (must EXACTLY match your Redirect URL in GHL + the install link)
 *
 * Also: add the SAME redirect to GHL App Builder → OAuth → Redirect URLs.
 */

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

async function exchangeAsJson({ code, redirectUri }) {
  const payload = {
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    // Docs show user_type in sample; "Company" works for agency/sub-account installs.
    user_type: "Company",
    redirect_uri: redirectUri,
  };
  return axios.post(TOKEN_URL, payload, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });
}

async function exchangeAsForm({ code, redirectUri }) {
  const body = new URLSearchParams({
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    user_type: "Company",
    redirect_uri: redirectUri,
  });
  return axios.post(TOKEN_URL, body.toString(), {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 20000,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }

    const { code, error, error_description } = req.query || {};
    if (error) return res.status(400).send(`OAuth error: ${error_description || error}`);
    if (!code) return res.status(400).send("Missing ?code");

    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    // Try JSON first (matches current docs); if it fails, try form-encoded.
    let resp;
    try {
      resp = await exchangeAsJson({ code, redirectUri });
    } catch (e) {
      // Log concise error, then fall back.
      console.error("Token JSON exchange failed:", e?.response?.status, e?.response?.data || e.message);
      resp = await exchangeAsForm({ code, redirectUri });
    }

    const data = resp?.data || {};
    const locId = data.locationId || data.location_id; // sometimes snake vs camel
    const userType = data.userType || data.user_type;

    // TODO: persist tokens keyed by locId (or companyId) in your DB/KV
    console.log("Connected location:", locId, "userType:", userType);
    console.log("Access token (last6):", (data.access_token || "").slice(-6));

    return res
      .status(200)
      .send("Sunflower Casita connected 🎉 You can close this tab.");
  } catch (e) {
    // Print exact API error for quick debugging in Vercel logs
    console.error("OAuth exchange failed:", e?.response?.status, e?.response?.data || e.message);
    return res.status(500).send("OAuth exchange failed");
  }
}
