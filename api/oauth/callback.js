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
    
    // Extract location ID from multiple possible sources
    const locationId = tokenData.locationId || tokenData.location_id;
    const companyId = tokenData.companyId || tokenData.company_id;
    
    const {
      access_token,
      refresh_token,
      expires_in,
      scope,
    } = tokenData;
    
    console.log("📦 Token data received:", {
      hasLocationId: !!locationId,
      hasCompanyId: !!companyId,
      locationId: locationId
    });

    if (!locationId) {
      console.error("❌ No locationId found in OAuth response");
      throw new Error("locationId not found in OAuth response");
    }

    console.log("✅ OAuth Success!");
    console.log("   Location ID:", locationId);
    console.log("   Company ID:", companyId);

    // Store tokens in Redis
    await storeLocationTokens(locationId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      companyId: companyId,
      locationId: locationId,
      scope: scope,
      installedAt: new Date().toISOString(),
    });

    // Register the payment integration
    console.log("📤 Creating payment integration...");
    try {
      const integrationResult = await createPaymentIntegration(locationId, access_token);
      console.log("✅ Integration created:", integrationResult._id);
    } catch (error) {
      console.error("⚠️ Integration creation failed:", error.message);
      console.error("   Status:", error.response?.status);
      console.error("   Data:", error.response?.data);
      // Continue anyway - user can try reconnecting
    }

    // Redirect to setup page
    // Use custom domain or Vercel URL
    const baseUrl = process.env.CUSTOM_DOMAIN || 'clover-integration25.vercel.app';
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
  const baseUrl = process.env.CUSTOM_DOMAIN || 'clover-integration25.vercel.app';
  
  const url = `https://services.leadconnectorhq.com/payments/custom-provider/provider?locationId=${locationId}`;
  
  const payload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and online",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    queryUrl: `https://${baseUrl}/api/payment/query`,
    
  };paymentsUrl: `https://${baseUrl}/payment-form`,

  console.log("📤 Creating integration with payload:", JSON.stringify(payload, null, 2));

  const response = await axios.post(url, payload, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Version": "2021-07-28",
    },
  });

  console.log("✅ Integration API response:", response.data);
  return response.data;
}