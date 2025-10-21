// api/payment/query.js
// This endpoint is called by GHL when someone clicks "Pay Now" on an invoice
// It tells GHL where to send the user to complete payment

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Query URL called from GHL");
    console.log("📦 Request body:", JSON.stringify(req.body, null, 2));

    const {
      locationId,
      invoiceId,
      amount,
      currency = "usd",
      customerId,
      customerEmail,
      customerName,
    } = req.body;

    // Validate required fields
    if (!locationId || !invoiceId || !amount) {
      console.error("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, invoiceId, or amount"
      });
    }

    console.log("✅ Valid payment query received:");
    console.log("   Location ID:", locationId);
    console.log("   Invoice ID:", invoiceId);
    console.log("   Amount:", amount, currency.toUpperCase());

    // Get the base URL from environment or use default
    const baseUrl = process.env.CUSTOM_DOMAIN || 
                    process.env.VERCEL_URL || 
                    'api.onesolutionapp.com';

    // Build the payment form URL with all parameters
    const paymentUrl = new URL(`https://${baseUrl}/payment-form`);
    paymentUrl.searchParams.set('locationId', locationId);
    paymentUrl.searchParams.set('invoiceId', invoiceId);
    paymentUrl.searchParams.set('amount', amount.toFixed(2));
    
    // Add optional customer info if available
    if (customerEmail) {
      paymentUrl.searchParams.set('customerEmail', customerEmail);
    }
    if (customerName) {
      paymentUrl.searchParams.set('customerName', customerName);
    }
    if (customerId) {
      paymentUrl.searchParams.set('customerId', customerId);
    }

    console.log("✅ Returning payment URL:", paymentUrl.toString());

    // Return the payment URL to GHL
    return res.status(200).json({
      success: true,
      paymentUrl: paymentUrl.toString(),
      provider: "clover",
      liveMode: false, // Set based on your configuration
      metadata: {
        invoiceId,
        locationId,
        amount
      }
    });

  } catch (error) {
    console.error("❌ Query endpoint error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate payment URL",
      message: error.message
    });
  }
}