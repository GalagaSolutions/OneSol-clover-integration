import { getLocationToken } from "../../lib/getLocationToken.js";
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
    console.log("🔔 Webhook received");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));

    const { type, merchantId, objectId, locationId, data } = req.body;

    // DETERMINE WEBHOOK SOURCE
    if (merchantId && objectId && (type === "PAYMENT_CREATED" || type === "CREATE")) {
      // This is a CLOVER webhook
      return await handleCloverWebhook(req, res);
    } else if (locationId && type && type.startsWith("Invoice")) {
      // This is a GHL webhook
      return await handleGHLWebhook(req, res);
    } else {
      console.log("❓ Unknown webhook type:", type);
      return res.status(200).json({ received: true, source: "unknown" });
    }

  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.status(200).json({ received: true, error: error.message });
  }
}

// CLOVER WEBHOOK HANDLER (Device Payments)
async function handleCloverWebhook(req, res) {
  const { type, merchantId, objectId } = req.body;
  
  console.log("🟢 CLOVER webhook detected");
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
      matched: false,
      source: "clover"
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
    invoiceId: match.invoiceId,
    source: "clover"
  });
}

// GHL WEBHOOK HANDLER (CRM Events)
async function handleGHLWebhook(req, res) {
  const { type, locationId, objectId, data } = req.body;
  
  console.log("🔵 GHL webhook detected");
  console.log("🎯 Event details:");
  console.log("   Type:", type);
  console.log("   Location:", locationId);
  console.log("   Object ID:", objectId);

  // Handle different GHL webhook events
  switch (type) {
    case "InvoiceCreate":
      console.log("📝 New invoice created:", data?.id);
      await handleInvoiceCreate(data, locationId);
      break;
      
    case "InvoiceUpdate":
      console.log("📋 Invoice updated:", data?.id);
      break;
      
    case "InvoicePaid":
      console.log("🎉 Invoice PAID:", data?.id, "Amount:", data?.total);
      await handleInvoicePaid(data, locationId);
      break;
      
    case "InvoicePartiallyPaid":
      console.log("💸 Invoice partially paid:", data?.id);
      break;
      
    case "InvoiceSent":
      console.log("📧 Invoice sent to customer:", data?.id);
      break;
      
    case "InvoiceVoid":
    case "InvoiceDelete":
      console.log("🗑️ Invoice voided/deleted:", data?.id);
      await cleanupInvoiceTracking(data, locationId);
      break;
      
    default:
      console.log("❓ Unknown GHL event:", type);
  }

  return res.status(200).json({ 
    received: true,
    type: type,
    source: "ghl"
  });
}

// CLOVER HELPER FUNCTIONS
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

// GHL HELPER FUNCTIONS
async function handleInvoiceCreate(invoice, locationId) {
  console.log("📝 Processing new invoice creation");
  
  // Store invoice info for potential device payment matching
  if (invoice.total && invoice.total > 0) {
    const amountInCents = Math.round(invoice.total * 100);
    const trackingKey = `pending_invoice_amount_${locationId}_${amountInCents}`;
    
    await redis.set(trackingKey, JSON.stringify({
      locationId,
      invoiceId: invoice.id,
      amount: amountInCents,
      customerName: invoice.contact?.name,
      customerEmail: invoice.contact?.email,
      timestamp: Date.now()
    }), { ex: 86400 }); // 24 hours
    
    console.log("✅ Invoice tracked for device payment matching");
  }
}

async function handleInvoicePaid(invoice, locationId) {
  console.log("🎉 INVOICE PAID SUCCESSFULLY!");
  console.log("   Invoice ID:", invoice.id);
  console.log("   Amount:", invoice.total);
  console.log("   Location:", locationId);
  
  // Log successful payment completion
  await redis.set(`invoice_paid_${invoice.id}`, JSON.stringify({
    invoiceId: invoice.id,
    amount: invoice.total,
    locationId,
    paidAt: Date.now(),
    status: "completed"
  }), { ex: 86400 * 30 }); // Keep for 30 days
  
  console.log("✅ Payment completion logged");
}

async function cleanupInvoiceTracking(invoice, locationId) {
  console.log("🗑️ Cleaning up invoice tracking");
  
  // Clean up any pending payment tracking
  if (invoice.total) {
    const amountInCents = Math.round(invoice.total * 100);
    const trackingKey = `pending_invoice_amount_${locationId}_${amountInCents}`;
    await redis.del(trackingKey);
  }
}