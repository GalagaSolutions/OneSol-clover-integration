import axios from "axios";

/**
 * Create a charge using YOUR Clover account
 */
export async function createCloverCharge(paymentData) {
  const { 
    amount,
    currency = "usd",
    source,
    customerId,
    description,
    metadata = {}
  } = paymentData;

  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const apiToken = process.env.CLOVER_API_TOKEN;
  const isProduction = process.env.CLOVER_ENVIRONMENT === "production";

  console.log("💳 Creating Clover charge:");
  console.log("   Merchant ID:", merchantId);
  console.log("   Amount:", amount, currency.toUpperCase());
  console.log("   Environment:", isProduction ? "PRODUCTION" : "SANDBOX");
  console.log("   Has API Token:", !!apiToken);
  console.log("   Token length:", apiToken ? apiToken.length : 0);

  // Validate required credentials
  if (!merchantId) {
    console.error("❌ Missing CLOVER_MERCHANT_ID");
    return {
      success: false,
      error: "Clover merchant ID not configured",
      code: "config_error"
    };
  }

  if (!apiToken) {
    console.error("❌ Missing CLOVER_API_TOKEN");
    return {
      success: false,
      error: "Clover API token not configured",
      code: "config_error"
    };
  }

  if (!source) {
    console.error("❌ Missing payment source token");
    return {
      success: false,
      error: "Payment token is required",
      code: "invalid_request"
    };
  }

  // Construct the correct API URL
  const baseUrl = isProduction 
    ? "https://api.clover.com"
    : "https://sandbox.dev.clover.com";

  const chargeUrl = `${baseUrl}/v1/charges`;
  
  console.log("🔗 API URL:", chargeUrl);

  try {
    const amountInCents = Math.round(amount * 100);

    const payload = {
      amount: amountInCents,
      currency: currency.toLowerCase(),
      source: source,
      capture: true,
      description: description || "Payment via GoHighLevel",
      metadata: {
        ...metadata,
        integration: "gohighlevel",
        processor: "clover"
      }
    };

    console.log("📤 Request payload:", JSON.stringify(payload, null, 2));

    const headers = {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    };

    // Add merchant ID header
    if (merchantId) {
      headers["X-Clover-Merchant-Id"] = merchantId;
    }

    console.log("📋 Request headers:", {
      "Authorization": "Bearer " + apiToken.substring(0, 10) + "...",
      "Content-Type": "application/json",
      "X-Clover-Merchant-Id": merchantId
    });

    const response = await axios.post(chargeUrl, payload, { headers });

    console.log("✅ Clover charge created successfully!");
    console.log("   Transaction ID:", response.data.id);
    console.log("   Status:", response.data.status);
    console.log("   Full response:", JSON.stringify(response.data, null, 2));

    return {
      success: true,
      transactionId: response.data.id,
      status: response.data.status,
      amount: response.data.amount / 100,
      currency: response.data.currency,
      created: response.data.created,
      card: {
        brand: response.data.source?.brand,
        last4: response.data.source?.last4,
      },
      raw: response.data
    };

  } catch (error) {
    console.error("❌ Clover charge failed!");
    console.error("   Error type:", error.name);
    console.error("   Error message:", error.message);
    console.error("   Status code:", error.response?.status);
    console.error("   Status text:", error.response?.statusText);
    console.error("   Response data:", JSON.stringify(error.response?.data, null, 2));
    console.error("   Request URL:", error.config?.url);
    console.error("   Request method:", error.config?.method);

    // Extract meaningful error message
    let errorMessage = "Payment processing failed";
    let errorCode = "processing_error";

    if (error.response) {
      // Server responded with error
      const status = error.response.status;
      const data = error.response.data;

      if (status === 400) {
        errorMessage = data.message || data.error || "Invalid payment request";
        errorCode = data.code || "invalid_request";
      } else if (status === 401) {
        errorMessage = "Invalid API credentials";
        errorCode = "authentication_error";
      } else if (status === 402) {
        errorMessage = data.message || "Payment declined";
        errorCode = "card_declined";
      } else if (status === 404) {
        errorMessage = "Clover API endpoint not found - check merchant ID";
        errorCode = "invalid_merchant";
      } else if (status === 502 || status === 503) {
        errorMessage = "Clover service temporarily unavailable";
        errorCode = "service_error";
      } else {
        errorMessage = data.message || data.error || `Server error (${status})`;
        errorCode = data.code || "server_error";
      }
    } else if (error.request) {
      // Request made but no response
      errorMessage = "Could not reach Clover API - network error";
      errorCode = "network_error";
    }

    return {
      success: false,
      error: errorMessage,
      code: errorCode,
      raw: error.response?.data
    };
  }
}

export async function refundCloverCharge(chargeId, amount = null) {
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const apiToken = process.env.CLOVER_API_TOKEN;
  const isProduction = process.env.CLOVER_ENVIRONMENT === "production";

  const baseUrl = isProduction 
    ? "https://api.clover.com"
    : "https://sandbox.dev.clover.com";

  try {
    const refundUrl = `${baseUrl}/v1/charges/${chargeId}/refund`;
    
    const payload = amount ? {
      amount: Math.round(amount * 100)
    } : {};

    const response = await axios.post(refundUrl, payload, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "X-Clover-Merchant-Id": merchantId,
      },
    });

    console.log("✅ Clover refund created:", response.data.id);

    return {
      success: true,
      refundId: response.data.id,
      amount: response.data.amount / 100,
      status: response.data.status
    };

  } catch (error) {
    console.error("❌ Clover refund failed:", error.response?.data);
    
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

export async function getCloverCharge(chargeId) {
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const apiToken = process.env.CLOVER_API_TOKEN;
  const isProduction = process.env.CLOVER_ENVIRONMENT === "production";

  const baseUrl = isProduction 
    ? "https://api.clover.com"
    : "https://sandbox.dev.clover.com";

  try {
    const chargeUrl = `${baseUrl}/v1/charges/${chargeId}`;

    const response = await axios.get(chargeUrl, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "X-Clover-Merchant-Id": merchantId,
      },
    });

    return {
      success: true,
      charge: response.data
    };

  } catch (error) {
    console.error("❌ Failed to get Clover charge:", error.response?.data);
    
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}