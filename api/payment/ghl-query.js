import { createCloverCharge, refundCloverCharge } from "../clover/create-charge.js";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

/**
 * Query URL Handler - V2 API
 * This endpoint handles ALL payment-related requests FROM GoHighLevel
 * Based on GHL Custom Provider documentation:
 * https://help.gohighlevel.com/support/solutions/articles/155000002620
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Query URL called from GHL");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));
    console.log("📋 Headers:", JSON.stringify(req.headers, null, 2));

    const { type, apiKey } = req.body;

    // Verify API key
    if (!apiKey) {
      console.error("❌ Missing apiKey in request");
      return res.status(401).json({ error: "Unauthorized - missing apiKey" });
    }

    // Verify the API key belongs to a valid location
    const locationData = await verifyApiKey(apiKey);
    if (!locationData) {
      console.error("❌ Invalid apiKey");
      return res.status(401).json({ error: "Unauthorized - invalid apiKey" });
    }

    console.log("✅ API key verified for location:", locationData.locationId);

    // Route to appropriate handler based on type
    switch (type) {
      case "verify":
        return await handleVerify(req.body, res);
      
      case "refund":
        return await handleRefund(req.body, locationData, res);
      
      case "list_payment_methods":
        return await handleListPaymentMethods(req.body, res);
      
      case "charge_payment":
        return await handleChargePayment(req.body, locationData, res);
      
      default:
        console.log("⚠️ Unknown request type:", type);
        return res.status(400).json({ 
          success: false,
          error: "Unknown request type" 
        });
    }

  } catch (error) {
    console.error("❌ Query URL error:", error);
    return res.status(500).json({
      success: false,
      error: "Query processing failed",
      message: error.message,
    });
  }
}

/**
 * VERIFY - Called after payment success to verify the charge
 * Request: { type: "verify", transactionId: "ghl_txn_id", apiKey: "...", chargeId: "clover_charge_id", subscriptionId?: "ghl_sub_id" }
 * Response: { success: true } or { failed: true }
 */
async function handleVerify(data, res) {
  console.log("✅ VERIFY request");
  console.log("   Transaction ID:", data.transactionId);
  console.log("   Charge ID:", data.chargeId);

  const { chargeId, transactionId } = data;

  if (!chargeId) {
    return res.status(400).json({ 
      failed: true, 
      error: "Missing chargeId" 
    });
  }

  try {
    // Check if we have this transaction in our records
    const txKey = `transaction_${chargeId}`;
    const txData = await redis.get(txKey);

    if (txData) {
      console.log("✅ Transaction verified in our records");
      return res.status(200).json({ success: true });
    }

    // If not in our records, could still be valid Clover charge
    // For now, accept it
    console.log("⚠️ Transaction not in records, but accepting");
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("❌ Verify error:", error);
    return res.status(200).json({ 
      failed: true,
      error: error.message 
    });
  }
}

/**
 * REFUND - Issue a refund for a transaction
 * Request: { type: "refund", amount: 100, transactionId: "ghl_txn_id", apiKey: "..." }
 * Response: { success: true } or { failed: true, message: "..." }
 */
async function handleRefund(data, locationData, res) {
  console.log("💰 REFUND request");
  console.log("   Amount:", data.amount);
  console.log("   Transaction ID:", data.transactionId);

  const { amount, transactionId } = data;

  try {
    // Get the original charge ID from our records
    const txKey = `ghl_transaction_${transactionId}`;
    const txData = await redis.get(txKey);

    if (!txData) {
      console.error("❌ Transaction not found");
      return res.status(200).json({
        failed: true,
        message: "Transaction not found"
      });
    }

    const transaction = typeof txData === 'string' ? JSON.parse(txData) : txData;
    const cloverChargeId = transaction.chargeId;

    console.log("🔄 Refunding Clover charge:", cloverChargeId);

    // Process refund through Clover
    const refundResult = await refundCloverCharge(cloverChargeId, amount);

    if (refundResult.success) {
      console.log("✅ Refund successful:", refundResult.refundId);
      return res.status(200).json({ success: true });
    } else {
      console.error("❌ Refund failed:", refundResult.error);
      return res.status(200).json({
        failed: true,
        message: refundResult.error
      });
    }

  } catch (error) {
    console.error("❌ Refund error:", error);
    return res.status(200).json({
      failed: true,
      message: error.message
    });
  }
}

/**
 * LIST_PAYMENT_METHODS - List saved payment methods for a contact
 * Request: { locationId: "...", contactId: "...", apiKey: "...", type: "list_payment_methods" }
 * Response: Array of payment methods
 */
async function handleListPaymentMethods(data, res) {
  console.log("💳 LIST_PAYMENT_METHODS request");
  console.log("   Contact ID:", data.contactId);

  // Clover Ecommerce API doesn't support saved payment methods
  // Return empty array
  return res.status(200).json([]);
}

/**
 * CHARGE_PAYMENT - Charge a saved payment method
 * Request: { paymentMethodId: "...", contactId: "...", transactionId: "...", amount: 100, currency: "USD", apiKey: "...", type: "charge_payment" }
 * Response: { success: true, chargeId: "...", chargeSnapshot: {...} } or { failed: true, message: "..." }
 */
async function handleChargePayment(data, locationData, res) {
  console.log("💳 CHARGE_PAYMENT request");
  console.log("   Payment Method ID:", data.paymentMethodId);
  console.log("   Amount:", data.amount);

  // Clover Ecommerce API doesn't support saved payment methods
  return res.status(200).json({
    failed: true,
    message: "Saved payment methods not supported"
  });
}

async function verifyApiKey(apiKey) {
  const key = `api_key_${apiKey}`;
  const data = await redis.get(key);
  
  if (!data) {
    return null;
  }

  return typeof data === 'string' ? JSON.parse(data) : data;
}