import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { code, location_id, locationId: queryLocationId } = req.query;

    if (!code) {
      console.error("❌ No authorization code provided");
      return res.status(400).send("Missing authorization code");
    }

    console.log("🔄 Exchanging authorization code for tokens...");

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);
    
    // Extract location ID from multiple possible sources
    let locationId = tokenData.locationId 
      || tokenData.location_id 
      || queryLocationId 
      || location_id;
      
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
    
    // If no locationId, try to get it from installer details API
    if (!locationId && companyId && access_token) {
      console.log("🔍 No locationId in token, fetching from installer details API...");
      try {
        const installerDetails = await getInstallerDetails(access_token);
        locationId = installerDetails.locationId || installerDetails.location_id;
        console.log("✅ Got locationId from installer details:", locationId);
      } catch (error) {
        console.error("⚠️ Could not get installer details:", error.message);
        console.error("   Response:", error.response?.data);
      }
    }
    
    if (!locationId) {
      console.error("❌ No locationId found in OAuth response or installer API");
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

    // CRITICAL: Create the integration association
    console.log("📤 Creating payment integration association...");
    try {
      const integrationResult = await createPaymentIntegration(locationId, access_token);
      console.log("✅ Integration created:", integrationResult);
    } catch (error) {
      console.error("❌ Integration creation FAILED:", error.message);
      console.error("   Status:", error.response?.status);
      console.error("   Data:", JSON.stringify(error.response?.data));
      
      // THIS IS CRITICAL - Don't proceed if integration fails
      // The user needs to know there's a problem
      return res.send(`
        <html>
          <head>
            <style>
              body { font-family: Arial; padding: 40px; background: #f5f5f5; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .error { color: #d32f2f; margin-bottom: 20px; }
              .details { background: #f5f5f5; padding: 15px; border-radius: 4px; font-size: 12px; font-family: monospace; margin: 20px 0; overflow-x: auto; }
              .btn { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>⚠️ Integration Setup Error</h1>
              <p class="error">OAuth completed successfully, but the payment integration failed to register with GoHighLevel.</p>
              
              <h3>Error Details:</h3>
              <div class="details">
Status: ${error.response?.status}
Message: ${error.response?.data?.message || error.message}
Location: ${locationId}
              </div>
              
              <h3>What to do:</h3>
              <ol>
                <li>Check that your app category is set to "Third Party Provider" in the Marketplace dashboard</li>
                <li>Verify your queryUrl and paymentsUrl are correctly configured</li>
                <li>Try uninstalling and reinstalling the app</li>
                <li>Contact support if the issue persists</li>
              </ol>
              
              <a href="https://app.gohighlevel.com/location/${locationId}/settings/payments" class="btn">Go to Payments Settings</a>
            </div>
          </body>
        </html>
      `);
    }

    // Redirect to setup page
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

async function getInstallerDetails(accessToken) {
  const url = "https://services.leadconnectorhq.com/oauth/installedLocation";
  
  const response = await axios.get(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Version": "2021-07-28",
    },
  });

  console.log("📦 Installer details:", JSON.stringify(response.data));
  return response.data;
}

async function createPaymentIntegration(locationId, accessToken) {
  const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
  
  // Use the provider endpoint - this creates the association
  const url = `https://services.leadconnectorhq.com/payments/custom-provider/provider?locationId=${locationId}`;
  
  const payload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and online",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    queryUrl: `https://${baseUrl}/api/payment/query`,
    paymentsUrl: `https://${baseUrl}/payment-form`,
  };

  console.log("📤 Creating integration:");
  console.log("   URL:", url);
  console.log("   Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Integration API response:", JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    // Log the full error for debugging
    console.error("❌ Integration creation failed");
    console.error("   Request URL:", url);
    console.error("   Request payload:", JSON.stringify(payload));
    console.error("   Response status:", error.response?.status);
    console.error("   Response data:", JSON.stringify(error.response?.data));
    throw error;
  }
}