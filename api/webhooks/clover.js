// api/webhooks/clover.js
import { getLocationToken } from "../utils/getLocationToken.js";
import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Webhook received from Clover");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));

    const { type, merchantId, objectId } = req.body;

    // Only process payment events
    if (type !== "PAYMENT_CREATED" && type !== "CREATE") {
      console.log("ℹ️ Ignoring event type:", type);
      return res.status(200).json({ received: true });
    }

    console.log("💳 Payment event detected!");
    console.log("   Merchant ID:", merchantId);
    console.log("   Payment ID:", objectId);

    // Get payment details from Clover
    const payment = await getCloverPayment(merchantId, objectId);
    
    if (!payment) {
      console.error("❌ Could not retrieve payment");
      return res.status(200).json({ received: true });
    }

    console.log("✅ Payment details:", {
      id: payment.id,
      amount: payment.amount / 100,
      note: payment.note
    });

    // Try to match payment to invoice
    const match = await matchPaymentToInvoice(payment);

    if (!match) {
      console.log("⚠️ No matching invoice found");
      await storeUnmatchedPayment(payment);
      return res.status(200).json({ 
        received: true, 
        matched: false 
      });
    }

    console.log("🎯 Matched to invoice:", match.invoiceId);

    // Update GHL invoice
    await updateGHLInvoice(match.locationId, match.invoiceId, {
      amount: payment.amount / 100,
      transactionId: payment.id
    });

    console.log("✅ Invoice updated!");

    return res.status(200).json({
      received: true,
      matched: true,
      invoiceId: match.invoiceId
    });

  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.status(200).json({ received: true, error: error.message });
  }
}

async function getCloverPayment(merchantId, paymentId) {
  const apiToken = process.env.CLOVER_API_TOKEN;
  const isProduction = process.env.CLOVER_ENVIRONMENT === "production";
  
  const baseUrl = isProduction 
    ? "https://api.clover.com"
    : "https://sandbox.dev.clover.com";

  try {
    const url = `${baseUrl}/v3/merchants/${merchantId}/payments/${paymentId}`;
    
    const response = await axios.get(url, {
      headers: { "Authorization": `Bearer ${apiToken}` }
    });

    return response.data;
  } catch (error) {
    console.error("Failed to get payment:", error.message);
    return null;
  }
}

async function matchPaymentToInvoice(payment) {
  // Strategy 1: Check payment note for invoice ID
  if (payment.note) {
    const invoiceMatch = payment.note.match(/(INV-[\w]+|TEST-[\w]+)/i);
    if (invoiceMatch) {
      const invoiceId = invoiceMatch[0];
      const locationId = await findLocationForInvoice(invoiceId);
      
      if (locationId) {
        return { locationId, invoiceId };
      }
    }
  }

  // Strategy 2: Match by amount and recent time
  const amountInCents = payment.amount;
  const key = `pending_invoice_${amountInCents}`;
  const match = await redis.get(key);
  
  if (match) {
    const data = typeof match === 'string' ? JSON.parse(match) : match;
    
    // Check if within 10 minutes
    const timeDiff = Date.now() - data.timestamp;
    if (timeDiff < 10 * 60 * 1000) {
      await redis.del(key);
      return {
        locationId: data.locationId,
        invoiceId: data.invoiceId
      };
    }
  }

  return null;
}

async function findLocationForInvoice(invoiceId) {
  // For now, return default location
  // In production, you'd query GHL API to find which location owns this invoice
  return "cv3mmKLIVdqbZSVeksCW";
}

async function storeUnmatchedPayment(payment) {
  const key = `unmatched_payment_${payment.id}`;
  await redis.set(key, JSON.stringify({
    paymentId: payment.id,
    amount: payment.amount / 100,
    timestamp: Date.now(),
    note: payment.note
  }), { ex: 86400 * 7 }); // 7 days
}

async function updateGHLInvoice(locationId, invoiceId, paymentData) {
  const accessToken = await getLocationToken(locationId);
  
  const url = `https://services.leadconnectorhq.com/invoices/${invoiceId}/record-payment`;
  
  await axios.post(url, {
    amount: paymentData.amount,
    paymentMode: "custom",
    transactionId: paymentData.transactionId,
    notes: "Payment via Clover device"
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28"
    }
  });
}