import { createCloverCharge } from "../clover/create-charge.js";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

/**
 * Process payment from GHL iframe
 * This is called by the payment iframe after tokenization
 * GHL will then call the queryUrl to verify the charge
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      source,
      amount,
      currency,
      orderId,
      transactionId,
      subscriptionId,
      locationId,
      contact,
    } = req.body;

    console.log("💳 Processing iframe payment:");
    console.log("   Amount:", amount, currency?.toUpperCase());
    console.log("   Order ID:", orderId);
    console.log("   Transaction ID:", transactionId);
    console.log("   Location ID:", locationId);

    if (!source || !amount || !locationId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    // Get Clover config for this location
    const cloverConfig = await getCloverConfig(locationId);
    if (!cloverConfig) {
      return res.status(400).json({
        success: false,
        error: "Clover not configured for this location"
      });
    }

    // Create charge in Clover
    const cloverResult = await createCloverCharge({
      amount: amount,
      currency: currency || "usd",
      source: source,
      customerId: contact?.id,
      description: orderId ? `GHL Order ${orderId}` : `Payment from ${contact?.name || contact?.email || 'customer'}`,
      metadata: {
        locationId,
        orderId,
        transactionId,
        subscriptionId,
        contactId: contact?.id,
        contactEmail: contact?.email,
        contactName: contact?.name,
        source: "ghl_iframe"
      }
    });

    if (!cloverResult.success) {
      console.error("❌ Clover charge failed:", cloverResult.error);
      return res.status(400).json({
        success: false,
        error: cloverResult.error,
        code: cloverResult.code
      });
    }

    console.log("✅ Payment successful!");
    console.log("   Charge ID:", cloverResult.transactionId);

    // Store transaction for verification
    await storeTransaction(locationId, {
      chargeId: cloverResult.transactionId,
      ghlTransactionId: transactionId,
      ghlOrderId: orderId,
      amount: cloverResult.amount,
      currency: cloverResult.currency,
      status: cloverResult.status,
      contactId: contact?.id,
      timestamp: Date.now(),
    });

    // Store mapping for GHL verification call
    if (transactionId) {
      await storeGHLTransactionMapping(transactionId, cloverResult.transactionId);
    }

    return res.status(200).json({
      success: true,
      chargeId: cloverResult.transactionId,
      status: cloverResult.status,
      amount: cloverResult.amount,
      currency: cloverResult.currency,
      card: cloverResult.card,
    });

  } catch (error) {
    console.error("❌ Iframe payment error:", error);
    return res.status(500).json({
      success: false,
      error: "Payment processing failed",
      message: error.message
    });
  }
}

async function getCloverConfig(locationId) {
  const key = `clover_config_${locationId}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }

  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function storeTransaction(locationId, transactionData) {
  const key = `transaction_${transactionData.chargeId}`;
  await redis.set(key, JSON.stringify({
    ...transactionData,
    locationId,
  }), { ex: 86400 * 7 }); // 7 days
  
  console.log("💾 Transaction stored:", transactionData.chargeId);
}

async function storeGHLTransactionMapping(ghlTransactionId, cloverChargeId) {
  const key = `ghl_transaction_${ghlTransactionId}`;
  await redis.set(key, JSON.stringify({
    chargeId: cloverChargeId,
    timestamp: Date.now(),
  }), { ex: 86400 * 7 }); // 7 days
  
  console.log("💾 GHL transaction mapping stored:", ghlTransactionId, "->", cloverChargeId);
}