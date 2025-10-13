import axios from "axios";
import { getLocationToken } from "../utils/getLocationToken.js";

export default async function handler(req, res) {
  const { locationId } = req.query;
  
  if (!locationId) {
    return res.status(400).json({ 
      error: "locationId required",
      usage: "Add ?locationId=YOUR_LOCATION_ID to the URL"
    });
  }

  try {
    console.log("🧪 Testing payment provider registration");
    console.log("   Location ID:", locationId);
    
    const accessToken = await getLocationToken(locationId);
    console.log("   ✅ Access token retrieved");
    
    // Try multiple endpoints to see which one works
    const results = [];
    
    // Attempt 1: Original endpoint with minimal payload
    console.log("\n📍 Attempt 1: /payments/custom-provider/connect (minimal)");
    try {
      const response1 = await axios.post(
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
        attempt: 1,
        endpoint: "custom-provider/connect", 
        payload: { locationId },
        success: true, 
        data: response1.data 
      });
    } catch (error) {
      console.log("   ❌ FAILED:", error.response?.status, error.response?.data?.message);
      results.push({ 
        attempt: 1,
        endpoint: "custom-provider/connect",
        payload: { locationId },
        success: false, 
        status: error.response?.status,
        error: error.response?.data 
      });
    }
    
    // Attempt 2: Original endpoint with full payload
    console.log("\n📍 Attempt 2: /payments/custom-provider/connect (full)");
    try {
      const payload2 = {
        locationId: locationId,
        liveMode: false,
        name: "Clover by PNC",
        description: "Accept payments via Clover"
      };
      const response2 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/connect",
        payload2,
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
        endpoint: "custom-provider/connect",
        payload: payload2,
        success: true, 
        data: response2.data 
      });
    } catch (error) {
      console.log("   ❌ FAILED:", error.response?.status, error.response?.data?.message);
      results.push({ 
        attempt: 2,
        endpoint: "custom-provider/connect",
        payload: { locationId, liveMode: false },
        success: false, 
        status: error.response?.status,
        error: error.response?.data 
      });
    }
    
    // Attempt 3: Alternative endpoint
    console.log("\n📍 Attempt 3: /payments/integrations/provider/connect");
    try {
      const payload3 = {
        locationId: locationId,
        provider: "clover",
        live: false
      };
      const response3 = await axios.post(
        "https://services.leadconnectorhq.com/payments/integrations/provider/connect",
        payload3,
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
        endpoint: "integrations/provider/connect",
        payload: payload3,
        success: true, 
        data: response3.data 
      });
    } catch (error) {
      console.log("   ❌ FAILED:", error.response?.status, error.response?.data?.message);
      results.push({ 
        attempt: 3,
        endpoint: "integrations/provider/connect",
        payload: { locationId, provider: "clover" },
        success: false, 
        status: error.response?.status,
        error: error.response?.data 
      });
    }

    // Attempt 4: Payment config endpoint
    console.log("\n📍 Attempt 4: /payments/custom-provider/config");
    try {
      const payload4 = {
        locationId: locationId,
        name: "Clover by PNC",
        description: "Clover payment processor",
        liveMode: false
      };
      const response4 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/config",
        payload4,
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
        attempt: 4,
        endpoint: "custom-provider/config",
        payload: payload4,
        success: true, 
        data: response4.data 
      });
    } catch (error) {
      console.log("   ❌ FAILED:", error.response?.status, error.response?.data?.message);
      results.push({ 
        attempt: 4,
        endpoint: "custom-provider/config",
        payload: { locationId, name: "Clover by PNC" },
        success: false, 
        status: error.response?.status,
        error: error.response?.data 
      });
    }

    // Attempt 5: Just locationId as string in body root
    console.log("\n📍 Attempt 5: /payments/custom-provider/connect (string body)");
    try {
      const response5 = await axios.post(
        "https://services.leadconnectorhq.com/payments/custom-provider/connect",
        locationId, // Send locationId as plain string
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "text/plain",
            "Version": "2021-07-28",
          },
        }
      );
      console.log("   ✅ SUCCESS!");
      results.push({ 
        attempt: 5,
        endpoint: "custom-provider/connect (text/plain)",
        payload: locationId,
        success: true, 
        data: response5.data 
      });
    } catch (error) {
      console.log("   ❌ FAILED:", error.response?.status, error.response?.data?.message);
      results.push({ 
        attempt: 5,
        endpoint: "custom-provider/connect (text/plain)",
        payload: locationId,
        success: false, 
        status: error.response?.status,
        error: error.response?.data 
      });
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log("\n📊 SUMMARY:");
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);

    return res.status(200).json({
      message: "Payment provider registration test complete",
      summary: {
        totalAttempts: results.length,
        successful: successCount,
        failed: failCount
      },
      results: results,
      recommendation: successCount > 0 
        ? "✅ Found working endpoint! Check results for details."
        : "❌ No endpoints worked. May need GHL marketplace approval or different approach."
    });

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return res.status(500).json({ 
      error: "Test failed",
      message: error.message,
      details: error.response?.data
    });
  }
}