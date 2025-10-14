import axios from "axios";
import { Redis } from "@upstash/redis";

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
    
    const locationId = tokenData.locationId || tokenData.location_id;
    const companyId = tokenData.companyId || tokenData.company_id;
    
    if (!locationId) {
      console.error("❌ No locationId found in token response:", tokenData);
      throw new Error("locationId not found in OAuth response");
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
    } = tokenData;

    console.log("✅ OAuth Success!");
    console.log("   Location ID:", locationId);
    console.log("   Company ID:", companyId);

    // Store tokens
    await storeLocationTokens(locationId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      companyId: companyId,
      locationId: locationId,
      scope: scope,
      installedAt: new Date().toISOString(),
    });

    // CRITICAL: Create Integration using V2 API format
    console.log("📤 Creating payment integration...");
    try {
      await createPaymentIntegration(locationId, access_token);
      console.log("✅ Payment integration created");
    } catch (error) {
      console.error("⚠️ Integration creation failed:", error.message);
      console.error("   Response:", error.response?.data);
    }

    // Redirect to setup page to collect Clover credentials
    const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
    const setupUrl = `https://${baseUrl}/setup?locationId=${locationId}&companyId=${companyId}`;
    
    console.log("🔄 Redirecting to setup:", setupUrl);
    return res.redirect(302, setupUrl);

  } catch (error) {
    console.error("❌ OAuth callback error:", error.response?.data || error.message);
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
    const response = await axios.post(tokenUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log("✅ Token exchange successful");
    return response.data;
  } catch (error) {
    console.log("⚠️ JSON exchange failed, trying form-encoded...");
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
  console.log(`✅ Tokens stored for location: ${locationId}`);
}

async function createPaymentIntegration(locationId, accessToken) {
  const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
  const url = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
  
  // V2 API format from documentation
  const payload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and online",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    locationId: locationId,
    queryUrl: `https://${baseUrl}/api/payment/query`,
    paymentsUrl: `https://${baseUrl}/payment-form`,
  };

  console.log("📤 Integration payload:", JSON.stringify(payload, null, 2));

  const response = await axios.post(url, payload, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Version": "2021-07-28",
    },
  });

  console.log("✅ Integration response:", JSON.stringify(response.data));
  return response.data;
}