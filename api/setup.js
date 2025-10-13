import { fetchCloverConfig } from "../lib/clover/config.js";

export default async function handler(req, res) {
  if (req.query.test === "clover") {
    const merchantId = process.env.CLOVER_MERCHANT_ID;
    const apiToken = process.env.CLOVER_API_TOKEN;
    const environment = process.env.CLOVER_ENVIRONMENT;

    return res.status(200).json({
      connected: Boolean(merchantId && apiToken && environment),
      merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : "NOT SET",
      hasApiToken: Boolean(apiToken),
      environment: environment || "NOT SET",
    });
  }

  const { locationId, location_id, companyId, company_id } = req.query;
  const resolvedLocationId = locationId || location_id || "";
  const resolvedCompanyId = companyId || company_id || "";

  let existingConfig = null;
  if (resolvedLocationId) {
    try {
      existingConfig = await fetchCloverConfig(resolvedLocationId);
    } catch (error) {
      console.error(
        "⚠️ Unable to load stored Clover configuration:",
        error.message
      );
    }
  }

  const sanitizedConfig = existingConfig
    ? {
        merchantId: existingConfig.merchantId || "",
        publicKey: existingConfig.publicKey || "",
        liveMode: Boolean(existingConfig.liveMode),
        configuredAt: existingConfig.configuredAt || null,
        hasApiToken: Boolean(existingConfig.apiToken),
      }
    : null;

  res.status(200).json({
    locationId: resolvedLocationId,
    companyId: resolvedCompanyId,
    config: sanitizedConfig,
  });
}
