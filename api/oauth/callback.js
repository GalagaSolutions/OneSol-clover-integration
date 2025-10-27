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
    
    console.log("📦 Token data received:", {
      hasLocationId: !!locationId,
      hasCompanyId: !!companyId,
      locationId: locationId
    });
    
    if (!locationId) {
      console.error("❌ No locationId in response:", tokenData);
      throw new Error("locationId not found in OAuth response");
    }

    const { access_token, refresh_token, expires_in, scope } = tokenData;

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

    // Create payment integration in GHL
    try {
      await createPaymentIntegration(locationId, access_token);
      console.log("✅ Payment integration created successfully");
    } catch (error) {
      console.error("⚠️ Integration creation failed:", error.message);
      console.log("   Will need manual setup in GHL");
    }

    // Redirect to setup page
    const setupUrl = `https://api.onesolutionapp.com/setup?locationId=${locationId}&companyId=${companyId}`;
    
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
    console.log("✅ Token exchange successful (JSON)");
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
  console.log("📤 Creating payment integration...");
  
  // ✅ Use the correct endpoint from GHL documentation
  const createUrl = `https://services.leadconnectorhq.com/payments/custom-provider/connect`;
  
  // ✅ ONLY the 6 fields GHL Support specified
  const payload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and online",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    locationId: locationId,
    queryUrl: `https://api.onesolutionapp.com/api/payment/query?locationId=${locationId}`,
    paymentsUrl: `https://api.onesolutionapp.com/payment-form?locationId=${locationId}`
  };

  console.log("📤 Creating integration with payload:");
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(createUrl, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      }
    });

    console.log("✅ Integration created successfully!");
    console.log("   Response:", JSON.stringify(response.data, null, 2));
    return response.data;
    
  } catch (error) {
    console.error("❌ Integration creation failed:", error.response?.status);
    console.error("   Status:", error.response?.status);
    console.error("   Data:", JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
}