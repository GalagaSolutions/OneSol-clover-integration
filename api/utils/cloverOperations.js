// api/utils/cloverOperations.js
import axios from "axios";
import { getCloverConfig } from "./cloverConfig";

export async function createCloverCharge({
  amount,
  currency = "usd",
  source,
  customerId,
  merchantId,
  apiToken,
  description,
  metadata
}) {
  try {
    // If merchantId and apiToken aren't provided, get from config
    if (!merchantId || !apiToken) {
      const config = await getCloverConfig(metadata.locationId);
      merchantId = config.merchantId;
      apiToken = config.apiToken;
    }

    const response = await axios.post(
      `https://api.clover.com/v3/merchants/${merchantId}/charges`,
      {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        source,
        customer_id: customerId,
        description,
        metadata
      },
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      transactionId: response.data.id,
      amount: response.data.amount / 100,
      currency: response.data.currency,
      status: response.data.status,
      card: response.data.source?.card
    };

  } catch (error) {
    console.error("❌ Clover charge error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      code: error.response?.status || 'UNKNOWN'
    };
  }
}