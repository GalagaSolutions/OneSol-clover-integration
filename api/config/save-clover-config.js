import { getLocationToken } from "../../lib/getLocationToken.js";
import { storeCloverConfig } from "../../lib/clover/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { locationId, merchantId, apiToken, publicKey, liveMode } = req.body;

    // Validate required fields
    if (!locationId || !merchantId || !apiToken) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, merchantId, or apiToken",
      });
    }

    console.log("💾 Saving Clover configuration for location:", locationId);
    console.log("   Mode:", liveMode ? "LIVE" : "TEST");

    // Store Clover credentials
    await storeCloverConfig(locationId, {
      merchantId,
      apiToken,
      publicKey,
      liveMode,
      configuredAt: new Date().toISOString(),
    });

    // Verify we can get the GHL access token (validates OAuth worked)
    try {
      await getLocationToken(locationId);
      console.log("✅ GHL access token verified for location:", locationId);
    } catch (error) {
      console.log("⚠️ Could not verify GHL token:", error.message);
    }

    console.log("✅ Clover configuration saved successfully");
    console.log("💡 Payment provider should now appear in GHL Payment Integrations");

    return res.status(200).json({
      success: true,
      message: "Clover configuration saved successfully. Please check Settings > Payments > Payment Integrations in your GHL sub-account.",
    });
  } catch (error) {
    console.error("❌ Failed to save Clover config:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to save configuration",
    });
  }
}
