import axios from "axios";
import { Redis } from "@upstash/redis";
import { getLocationToken } from "../utils/getLocationToken.js";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { locationId, check, test, action } = req.query;

  // Route to appropriate test based on query params
  if (action === "register" || test === "register") {
    return await testPaymentProviderRegistration(locationId, res);
  }

  if (action === "diagnostics" || check === "token") {
    return await checkTokenStatus(locationId, res);
  }

  if (check === "clover") {
    return checkCloverConnection(res);
  }

  // Default: show available tests
  return res.status(200).json({
    message: "Debug & Test Endpoint",
    availableTests: {
      clover: "?check=clover - Check Clover credentials",
      token: "?check=token&locationId=XXX - Check OAuth token status",
      register: "?action=register&locationId=XXX - Test payment provider registration"
    }
  });
}

function checkCloverConnection(res) {
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const apiToken = process.env.CLOVER_API_TOKEN;
  const pakmsKey = process.env.CLOVER_PAKMS_KEY;
  const environment = process.env.CLOVER_ENVIRONMENT;

  return res.status(200).json({
    connected: !!(merchantId && apiToken && environment),
    merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : "NOT SET",
    hasApiToken: !!apiToken,
    hasPakmsKey: !!pakmsKey,
    environment: environment || "NOT SET",
  });
}

async function checkTokenStatus(locationId, res) {
  if (!locationId) {
    return res.status(400).json({ 
      error: "Missing locationId parameter",
      usage: "Add ?check=token&locationId=YOUR_LOCATION_ID"
    });
  }

  try {
    const key = `ghl_location_${locationId}`;
    const tokenData = await redis.get(key);
    
    if (!tokenData) {
      return res.status(404).json({ 
        error: "No tokens found for this location",
        locationId: locationId,
        message: "OAuth not completed. Need to install app."
      });
    }

    const parsedData = typeof tokenData === 'string' ? JSON.parse(tokenData) : tokenData;
    
    return res.status(200).json({
      success: true,
      locationId: locationId,
      hasAccessToken: !!parsedData.accessToken,
      hasRefreshToken: !!parsedData.refreshToken,
      tokenExpires: new Date(parsedData.expiresAt).toISOString(),
      isExpired: Date.now() >= parsedData.expiresAt,
      installedAt: parsedData.installedAt,
      companyId: parsedData.companyId,
      scopes: parsedData.scope,
      scopeCount: parsedData.scope?.split(' ').length || 0,
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: "Failed to retrieve token",
      message: error.message 
    });
  }
}

async function testPaymentProviderRegistration(locationId, res) {
  if (!locationId) {
    return res.status(400).json({ 
      error: "locationId required",
      usage: "Add ?action=register&locationId=YOUR_LOCATION_ID"
    });
  }

  try {
    console.log("🧪 Testing payment provider registration");
    const accessToken = await getLocationToken(locationId);
    const results = [];
    
    // Attempt 1: OAuth Integrations endpoint (CORRECT)
    console.log("\n📍 Attempt 1: /oauth/integrations");
    try {
      const r1 = await axios.post(
        "https://services.leadconnectorhq.com/oauth/integrations",
        { 
          name: "Clover by PNC",
          description: "Accept payments via Clover",
          locationId,
          queryUrl: "https://api.onesolutionapp.com/payments/query",
          paymentsUrl: `https://api.onesolutionapp.com/payment-form-simple?locationId=${locationId}`
        },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        }
      );
      console.log("   ✅ SUCCESS!");
      results.push({ 
        attempt: 1, 
        endpoint: "oauth/integrations (CORRECT)", 
        success: true, 
        data: r1.data 
      });
    } catch (e) {
      console.log("   ❌ FAILED:", e.response?.status);
      results.push({ 
        attempt: 1, 
        endpoint: "oauth/integrations (CORRECT)", 
        success: false, 
        status: e.response?.status, 
        error: e.response?.data 
      });
    }
    
    // Attempt 2: Custom provider connect (minimal)
    console.log("\n📍 Attempt 2: /payments/custom-provider/connect (minimal)");
    try {
      const r2 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/connect",
        { locationId },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        }
      );
      console.log("   ✅ SUCCESS!");
      results.push({ 
        attempt: 2, 
        endpoint: "custom-provider/connect (minimal)", 
        success: true, 
        data: r2.data 
      });
    } catch (e) {
      console.log("   ❌ FAILED:", e.response?.status);
      results.push({ 
        attempt: 2, 
        endpoint: "custom-provider/connect (minimal)", 
        success: false, 
        status: e.response?.status, 
        error: e.response?.data 
      });
    }
    
    // Attempt 3: Custom provider config
    console.log("\n📍 Attempt 3: /payments/custom-provider/config");
    try {
      const r3 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/config",
        { 
          locationId, 
          liveMode: false,
          name: "Clover by PNC",
          queryUrl: "https://api.onesolutionapp.com/payments/query",
          paymentsUrl: `https://api.onesolutionapp.com/payment-form-simple?locationId=${locationId}`
        },
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Version": "2021-07-28",
          },
        }
      );
      console.log("   ✅ SUCCESS!");
      results.push({ 
        attempt: 3, 
        endpoint: "custom-provider/config", 
        success: true, 
        data: r3.data 
      });
    } catch (e) {
      console.log("   ❌ FAILED:", e.response?.status);
      results.push({ 
        attempt: 3, 
        endpoint: "custom-provider/config", 
        success: false, 
        status: e.response?.status, 
        error: e.response?.data 
      });
    }

    const successCount = results.filter(r => r.success).length;
    console.log("\n📊 SUMMARY: Successful:", successCount, "Failed:", results.length - successCount);

    return res.status(200).json({
      message: "Payment provider registration test complete",
      summary: { 
        totalAttempts: results.length, 
        successful: successCount, 
        failed: results.length - successCount 
      },
      results,
      recommendation: successCount > 0 
        ? "✅ Found working endpoint!" 
        : "❌ No endpoints worked. May need GHL marketplace approval."
    });

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return res.status(500).json({ 
      error: error.message,
      details: error.response?.data
    });
  }
}