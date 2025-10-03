// api/oauth/callback.js
import axios from "axios";

export default async function handler(req, res) {
  try {
    const { code, locationId: locId } = req.query;
    if (!code) return res.status(400).send("Missing ?code");

    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    const clientId = process.env.GHL_CLIENT_ID;
    const clientSecret = process.env.GHL_CLIENT_SECRET;
    const userType = "Location"; // we want a location-scoped token

    const tokenUrl = "https://services.leadconnectorhq.com/oauth/token";

    async function exchangeJson() {
      return axios.post(
        tokenUrl,
        {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          user_type: userType,
          redirect_uri: redirectUri,
        },
        { headers: { "Content-Type": "application/json" } }
      );
    }

    async function exchangeForm() {
      const params = new URLSearchParams();
      params.set("client_id", clientId);
      params.set("client_secret", clientSecret);
      params.set("grant_type", "authorization_code");
      params.set("code", code);
      params.set("user_type", userType);
      params.set("redirect_uri", redirectUri);
      return axios.post(tokenUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    }

    let data;
    try {
      const r = await exchangeJson();
      data = r.data;
    } catch (err) {
      console.log("Token JSON exchange failed:", err.response?.status, err.response?.data);
      const r2 = await exchangeForm();
      data = r2.data;
    }

    // Log the tokens once so you can copy them for provider registration.
    console.log(
      "OAUTH_RESULT",
      JSON.stringify(
        {
          locationId: locId || "(not provided)",
          userType,
          scope: data.scope,
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
        },
        null,
        2
      )
    );

    res.status(200).send("Sunflower Casita connected 🎉 You can close this tab.");
  } catch (e) {
    console.error("OAuth exchange failed", e.response?.status, e.response?.data || e.message);
    res.status(500).send("OAuth exchange failed");
  }
}
