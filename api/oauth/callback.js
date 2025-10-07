import axios from "axios";
import { Redis } from "@upstash/redis";

// Initialize Redis with your Vercel environment variables
const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      console.error("❌ No authorization code provided");
      return res.status(400).send("Missing authorization code");
    }

    console.log("🔄 Exchanging authorization code for tokens...");

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);
    
    const {
      access_token,
      refresh_token,
      expires_in,
      locationId,
      companyId,
      scope,
    } = tokenData;

    console.log("✅ OAuth Success!");
    console.log("   Location ID:", locationId);
    console.log("   Company ID:", companyId);
    console.log("   Scopes:", scope);

    // Store tokens in Redis
    await storeLocationTokens(locationId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      companyId,
      scope,
      installedAt: new Date().toISOString(),
    });

    // Register payment provider with this location
    try {
      await registerPaymentProvider(locationId, access_token);
      console.log("✅ Payment provider registered successfully!");
    } catch (error) {
      console.error("⚠️ Payment provider registration failed:", error.response?.data || error.message);
      console.log("   This may need to be done manually in GHL");
    }

    // Redirect back to GHL payments page
    const redirectUrl = `https://app.gohighlevel.com/location/${locationId}/settings/payments`;
    
    console.log("🔄 Redirecting user to:", redirectUrl);
    return res.redirect(302, redirectUrl);

  } catch (error) {
    console.error("❌ OAuth callback error:", error.response?.data || error.message);
    
    // Redirect to GHL with error
    return res.redirect(302, "https://app.gohighlevel.com/oauth/error");
  }
}

async function exchangeCodeForToken(code) {
  const tokenUrl = "https://services.leadconnectorhq.com/oauth/token";
  const payload = {
    client_id: process.env.GHL_CLIENT_ID,
    client_secret: process.env.GHL_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: process.env.OAUTH_REDIRECT_URI,
  };

  try {
    // Try JSON first (recommended by GHL)
    const response = await axios.post(tokenUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("✅ Token exchange successful (JSON)");
    return response.data;
  } catch (error) {
    console.log("⚠️ JSON exchange failed, trying form-encoded...");
    
    // Fallback to form-encoded
    const params = new URLSearchParams(payload);
    const response = await axios.post(tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    console.log("✅ Token exchange successful (form-encoded)");
    return response.data;
  }
}

async function storeLocationTokens(locationId, tokenData) {
  const key = `ghl_location_${locationId}`;
  await redis.set(key, JSON.stringify(tokenData));
  console.log(`✅ Tokens stored in Redis for location: ${locationId}`);
}

async function registerPaymentProvider(locationId, accessToken) {
  // This API call makes your payment provider appear in the location's payment integrations
  const registerUrl = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
  
  const payload = {
    locationId: locationId,
    liveMode: false, // Set to true for production
  };

  const response = await axios.post(registerUrl, payload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  });

  return response.data;
}