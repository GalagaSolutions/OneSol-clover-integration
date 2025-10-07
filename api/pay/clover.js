import axios from "axios";
import { getLocationToken } from "../utils/getLocationToken.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { locationId, amount, currency, customerId, paymentMethod } = req.body;

    // Validate required fields
    if (!locationId || !amount) {
      return res.status(400).json({ error: "Missing required fields: locationId and amount" });
    }

    console.log("💳 Processing payment for location:", locationId);

    // Get GHL access token for this location
    const accessToken = await getLocationToken(locationId);

    // TODO: Process payment with Clover
    // You'll need to add your Clover API integration here
    const cloverResponse = await processCloverPayment({
      amount,
      currency: currency || "usd",
      customerId,
      paymentMethod,
    });

    console.log("✅ Clover payment processed:", cloverResponse.id);

    // Report payment to GHL
    await reportPaymentToGHL(locationId, accessToken, {
      amount,
      currency: currency || "usd",
      status: "succeeded",
      externalTransactionId: cloverResponse.id,
    });

    return res.status(200).json({
      success: true,
      transactionId: cloverResponse.id,
    });

  } catch (error) {
    console.error("❌ Payment processing error:", error);
    return res.status(500).json({
      error: "Payment processing failed",
      message: error.message,
    });
  }
}

async function processCloverPayment(paymentData) {
  // TODO: Implement actual Clover payment processing
  // This is where you'd integrate with Clover's API using your Clover credentials
  console.log("🔄 Processing Clover payment:", paymentData);
  
  // Placeholder - replace with actual Clover API calls
  return {
    id: `clover_${Date.now()}`,
    status: "succeeded",
    amount: paymentData.amount,
  };
}

async function reportPaymentToGHL(locationId, accessToken, paymentData) {
  const url = "https://services.leadconnectorhq.com/payments/orders";
  
  await axios.post(url, {
    locationId,
    ...paymentData,
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  });

  console.log("✅ Payment reported to GHL");
}