import { createCloverCharge, refundCloverCharge } from "./clover/create-charge.js";
import { getLocationToken } from "./utils/getLocationToken.js";
import { Redis } from "@upstash/redis";
import axios from "axios";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

/**
 * Combined Payment Handler
 * Handles: /api/payment/process, /api/payment/query, /api/payment/iframe
 * Routes based on URL path or request type
 */
export default async function handler(req, res) {
  const path = req.url?.split('?')[0] || '';
  
  // Route 1: GHL Query URL
  if (path.includes('/query') || req.body?.type) {
    return handleQueryURL(req, res);
  }
  
  // Route 2: Process Iframe Payment
  if (path.includes('/iframe') || req.body?.orderId) {
    return handleIframePayment(req, res);
  }
  
  // Route 3: Process Standalone Payment (default)
  return handleStandalonePayment(req, res);
}

/**
 * QUERY URL HANDLER - For GHL backend calls
 */
async function handleQueryURL(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Query URL called from GHL");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));

    const { type, apiKey } = req.body;

    if (!apiKey) {
      console.error("❌ Missing apiKey");
      return res.status(401).json({ error: "Unauthorized - missing apiKey" });
    }

    const locationData = await verifyApiKey(apiKey);
    if (!locationData) {
      console.error("❌ Invalid apiKey");
      return res.status(401).json({ error: "Unauthorized - invalid apiKey" });
    }

    console.log("✅ API key verified for location:", locationData.locationId);

    switch (type) {
      case "verify":
        return await handleVerify(req.body, res);
      case "refund":
        return await handleRefund(req.body, locationData, res);
      case "list_payment_methods":
        return res.status(200).json([]);
      case "charge_payment":
        return res.status(200).json({
          failed: true,
          message: "Saved payment methods not supported"
        });
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

async function handleVerify(data, res) {
  console.log("✅ VERIFY request");
  console.log("   Transaction ID:", data.transactionId);
  console.log("   Charge ID:", data.chargeId);

  const { chargeId } = data;

  if (!chargeId) {
    return res.status(400).json({ 
      failed: true, 
      error: "Missing chargeId" 
    });
  }

  try {
    const txKey = `transaction_${chargeId}`;
    const txData = await redis.get(txKey);

    if (txData) {
      console.log("✅ Transaction verified in records");
      return res.status(200).json({ success: true });
    }

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

async function handleRefund(data, locationData, res) {
  console.log("💰 REFUND request");
  console.log("   Amount:", data.amount);
  console.log("   Transaction ID:", data.transactionId);

  const { amount, transactionId } = data;

  try {
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
 * IFRAME PAYMENT HANDLER - For GHL iframe payments
 */
async function handleIframePayment(req, res) {
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
    console.log("   Location ID:", locationId);

    if (!source || !amount || !locationId) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

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

/**
 * STANDALONE PAYMENT HANDLER - For direct payment form
 */
async function handleStandalonePayment(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      locationId,
      invoiceId,
      amount,
      currency = "usd",
      source,
      customerId,
      customerEmail,
      customerName,
    } = req.body;

    if (!locationId || !amount || !source) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, amount, or source"
      });
    }

    console.log("💰 Processing standalone payment:");
    console.log("   Location ID:", locationId);
    console.log("   Amount:", amount, currency.toUpperCase());
    console.log("   Invoice ID:", invoiceId);

    const cloverResult = await createCloverCharge({
      amount,
      currency,
      source,
      customerId,
      description: invoiceId ? `GHL Invoice ${invoiceId}` : `Payment from ${customerName || customerEmail}`,
      metadata: {
        locationId,
        invoiceId,
        customerEmail,
        customerName,
        source: "standalone_form"
      }
    });

    if (!cloverResult.success) {
      return res.status(400).json({
        success: false,
        error: cloverResult.error,
        code: cloverResult.code
      });
    }

    console.log("✅ Payment successful in Clover!");

    let invoiceUpdated = false;
    if (invoiceId) {
      try {
        const accessToken = await getLocationToken(locationId);
        await recordPaymentInGHL(locationId, invoiceId, accessToken, {
          amount,
          transactionId: cloverResult.transactionId,
          customerEmail,
          customerName,
        });
        console.log("✅ Payment recorded in GHL");
        invoiceUpdated = true;
      } catch (error) {
        console.error("⚠️ Failed to update GHL:", error.message);
      }
    }

    return res.status(200).json({
      success: true,
      transactionId: cloverResult.transactionId,
      amount: cloverResult.amount,
      currency: cloverResult.currency,
      status: cloverResult.status,
      card: cloverResult.card,
      message: "Payment processed successfully",
      invoiceUpdated: invoiceUpdated,
      warning: !invoiceUpdated && invoiceId ? "Payment successful. Invoice update may require manual verification." : null
    });

  } catch (error) {
    console.error("❌ Payment processing error:", error);
    return res.status(500).json({
      success: false,
      error: "Payment processing failed",
      message: error.message
    });
  }
}

async function recordPaymentInGHL(locationId, invoiceId, accessToken, paymentData) {
  console.log("📝 Recording payment in GHL");
  
  const customProviderUrl = "https://services.leadconnectorhq.com/payments/custom-provider/record";
  
  const payload = {
    locationId: locationId,
    invoiceId: invoiceId,
    amount: Math.round(paymentData.amount * 100),
    currency: "usd",
    transactionId: paymentData.transactionId,
    paymentMode: "live",
    status: "succeeded",
    provider: "clover",
    metadata: {
      customerEmail: paymentData.customerEmail,
      customerName: paymentData.customerName,
      processor: "clover",
      source: "custom_payment_form"
    }
  };
  
  try {
    const response = await axios.post(customProviderUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });
    
    console.log("✅ Payment recorded via Custom Provider API");
    return;
    
  } catch (error) {
    console.error("❌ Custom Provider API failed:", error.response?.status, error.response?.data);
    
    const ordersUrl = "https://services.leadconnectorhq.com/payments/orders";
    
    const ordersPayload = {
      locationId: locationId,
      amount: Math.round(paymentData.amount * 100),
      currency: "usd",
      status: "succeeded",
      externalTransactionId: paymentData.transactionId,
      transactionType: "charge",
      paymentMode: "live",
      invoiceId: invoiceId,
      metadata: {
        provider: "clover",
        processor: "clover_integration"
      }
    };
    
    const response2 = await axios.post(ordersUrl, ordersPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });
    
    console.log("✅ Payment recorded via Orders API");
  }
}

async function verifyApiKey(apiKey) {
  const key = `api_key_${apiKey}`;
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
  }), { ex: 86400 * 7 });
  
  console.log("💾 Transaction stored:", transactionData.chargeId);
}

async function storeGHLTransactionMapping(ghlTransactionId, cloverChargeId) {
  const key = `ghl_transaction_${ghlTransactionId}`;
  await redis.set(key, JSON.stringify({
    chargeId: cloverChargeId,
    timestamp: Date.now(),
  }), { ex: 86400 * 7 });
  
  console.log("💾 GHL transaction mapping stored:", ghlTransactionId, "->", cloverChargeId);
}