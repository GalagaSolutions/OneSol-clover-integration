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

  const baseUrl = isProduction 
    ? "https://api.clover.com"
    : "https://sandbox.dev.clover.com";

  console.log("💳 Creating Clover charge:");
  console.log("   Merchant ID:", merchantId);
  console.log("   Amount:", amount, currency.toUpperCase());
  console.log("   Environment:", isProduction ? "PRODUCTION" : "SANDBOX");

  try {
    const amountInCents = Math.round(amount * 100);

    const chargeUrl = `${baseUrl}/v1/charges`;
    
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

    const response = await axios.post(chargeUrl, payload, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "X-Clover-Merchant-Id": merchantId,
      },
    });

    console.log("✅ Clover charge created:", response.data.id);

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
    console.error("❌ Clover charge failed:");
    console.error("   Status:", error.response?.status);
    console.error("   Error:", error.response?.data);

    return {
      success: false,
      error: error.response?.data?.message || error.message,
      code: error.response?.data?.code,
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