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
    console.log("📦 Query params:", { 
      hasCode: !!code, 
      location_id, 
      queryLocationId,
      allParams: Object.keys(req.query)
    });

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(code);
    
    // Try multiple ways to get locationId
    let locationId = tokenData.locationId 
      || tokenData.location_id 
      || queryLocationId 
      || location_id;
      
    const companyId = tokenData.companyId || tokenData.company_id;
    const isBulkInstallation = tokenData.isBulkInstallation || false;
    
    console.log("📦 Token data received:", {
      hasLocationId: !!locationId,
      hasCompanyId: !!companyId,
      isBulkInstallation,
      userId: tokenData.userId,
      allTokenFields: Object.keys(tokenData)
    });
    
    // If no locationId yet, try to get it from marketplace installer details API
    if (!locationId && companyId && tokenData.access_token) {
      console.log("🔍 No locationId found, fetching from installer details API...");
      try {
        const installerDetails = await getInstallerDetails(tokenData.access_token);
        locationId = installerDetails.locationId || installerDetails.location_id;
        console.log("✅ Got locationId from installer details:", locationId);
      } catch (error) {
        console.error("⚠️ Could not get installer details:", error.message);
        console.error("   Error response:", error.response?.data);
      }
    }
    
    // If STILL no locationId, check if we can decode it from the JWT
    if (!locationId && tokenData.access_token) {
      console.log("🔍 Attempting to decode locationId from JWT...");
      try {
        const decoded = decodeJWT(tokenData.access_token);
        console.log("📦 JWT decoded:", decoded);
        locationId = decoded.locationId || decoded.location_id;
        if (locationId) {
          console.log("✅ Got locationId from JWT:", locationId);
        }
      } catch (error) {
        console.error("⚠️ Could not decode JWT:", error.message);
      }
    }
    
    // Handle both location-level and agency-level installations
    if (!locationId && !companyId) {
      console.error("❌ No locationId or companyId found in token response");
      throw new Error("locationId or companyId not found in OAuth response");
    }
    
    // For agency-level installations without specific location
    if (!locationId && isBulkInstallation) {
      console.log("🏢 Agency-level installation detected");
      console.log("   Company ID:", companyId);
      
      // Store agency-level tokens
      await storeAgencyTokens(companyId, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
        companyId: companyId,
        scope: tokenData.scope,
        installedAt: new Date().toISOString(),
        isBulkInstallation: true,
      });
      
      // Redirect with message about manual setup per location
      const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
      return res.send(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>⚠️ Agency-Level Installation</h1>
            <p>This app needs to be installed at the sub-account level, not agency-wide.</p>
            <p>Please reinstall and select a specific location/sub-account.</p>
            <br>
            <a href="https://marketplace.gohighlevel.com" style="padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Marketplace</a>
          </body>
        </html>
      `);
    }
    
    // If we still don't have locationId, use companyId as fallback
    if (!locationId) {
      console.log("⚠️ Using companyId as locationId fallback");
      locationId = companyId;
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

async function storeAgencyTokens(companyId, tokenData) {
  const key = `ghl_company_${companyId}`;
  await redis.set(key, JSON.stringify(tokenData));
  console.log(`✅ Agency tokens stored for company: ${companyId}`);
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

function decodeJWT(token) {
  // Decode JWT (just the payload, no verification needed here)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  
  const payload = parts[1];
  const decoded = Buffer.from(payload, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

async function createPaymentIntegration(locationId, accessToken) {
  const baseUrl = process.env.VERCEL_URL || 'api.onesolutionapp.com';
  
  // Try the integration provider endpoint instead
  const url = `https://services.leadconnectorhq.com/payments/integrations/provider/${locationId}/connect`;
  
  const payload = {
    name: "Clover by PNC",
    description: "Accept payments via Clover devices and online",
    imageUrl: "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    queryUrl: `https://${baseUrl}/api/payment/query`,
    paymentsUrl: `https://${baseUrl}/payment-form`,
  };

  console.log("📤 Integration payload (v2):", JSON.stringify(payload, null, 2));
  console.log("📤 URL:", url);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });

    console.log("✅ Integration response:", JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    console.error("❌ Integration failed with URL in path, trying in body...");
    
    // Fallback: Try original endpoint with locationId in body
    const fallbackUrl = "https://services.leadconnectorhq.com/payments/custom-provider/connect";
    const fallbackPayload = {
      ...payload,
      locationId: String(locationId)
    };
    
    console.log("📤 Fallback payload:", JSON.stringify(fallbackPayload, null, 2));
    
    const response2 = await axios.post(fallbackUrl, fallbackPayload, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28",
      },
    });
    
    console.log("✅ Integration response (fallback):", JSON.stringify(response2.data));
    return response2.data;
  }
}