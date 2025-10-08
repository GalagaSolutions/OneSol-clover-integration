export default async function handler(req, res) {
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const apiToken = process.env.CLOVER_API_TOKEN;
  const environment = process.env.CLOVER_ENVIRONMENT;

  const hasCredentials = !!(merchantId && apiToken && environment);

  return res.status(200).json({
    connected: hasCredentials,
    merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : "NOT SET",
    hasApiToken: !!apiToken,
    environment: environment || "NOT SET",
    message: hasCredentials 
      ? "✅ Clover credentials configured" 
      : "❌ Clover credentials missing"
  });
}