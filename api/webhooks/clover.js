import { getLocationToken } from "../../lib/getLocationToken.js";
import { recordPaymentInGHL } from "../../lib/ghlInvoiceUpdate.js";
import { matchPaymentToInvoice, storeUnmatchedPayment } from "../../lib/paymentMatching.js";
import { notifyFailedInvoiceUpdate } from "../../lib/notificationService.js";
import { getCloverConfig } from "../../lib/cloverConfig.js";
import axios from "axios";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

/**
 * Get payment details from Clover API
 */
async function getCloverPayment(merchantId, paymentId) {
  try {
    const config = await getCloverConfig(merchantId);
    if (!config) {
      throw new Error('Clover configuration not found for merchant');
    }

    const response = await axios.get(
      `https://api.clover.com/v3/merchants/${merchantId}/payments/${paymentId}`,
      {
        headers: { 
          "Authorization": `Bearer ${config.apiToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data || null;
  } catch (error) {
    console.error("Failed to get payment details:", error.message);
    return null;
  }
}

/**
 * Main webhook handler for Clover events
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔔 Webhook received from Clover");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));

    const { type, merchantId, objectId } = req.body;

    if (!type || !merchantId || !objectId) {
      return res.status(400).json({ 
        received: true,
        status: 'error',
        error: 'Missing required webhook data'
      });
    }

    // Only process payment events
    if (type !== "PAYMENT_CREATED" && type !== "CREATE") {
      console.log("ℹ️ Ignoring event type:", type);
      return res.status(200).json({ received: true });
    }

    console.log("💳 Payment event detected:", { merchantId, paymentId: objectId });

    // Get payment details from Clover
    const payment = await getCloverPayment(merchantId, objectId);
    
    if (!payment) {
      return res.status(200).json({ 
        received: true,
        status: 'error',
        error: 'Could not retrieve payment details'
      });
    }

    console.log("✅ Payment details:", {
      id: payment.id,
      amount: payment.amount / 100,
      note: payment.note
    });

    // Try to match payment to invoice
    const match = await matchPaymentToInvoice(payment, merchantId);
    
    if (!match) {
      await storeUnmatchedPayment(payment, merchantId);
      return res.status(200).json({ 
        received: true,
        matched: false,
        status: 'unmatched',
        message: 'Payment stored for later matching'
      });
    }

    // Try to update the GHL invoice
    try {
      const accessToken = await getLocationToken(match.locationId);
      await recordPaymentInGHL(match.locationId, match.invoiceId, accessToken, {
        amount: payment.amount / 100,
        transactionId: payment.id
      });
      
      return res.status(200).json({
        received: true,
        matched: true,
        invoiceId: match.invoiceId,
        status: 'completed',
        message: 'Payment processed and invoice updated'
      });

    } catch (error) {
      // Store failed update for retry
      const failureKey = `failed_invoice_update_${payment.id}`;
      await redis.set(failureKey, JSON.stringify({
        error: "Payment processed successfully but invoice update failed",
        paymentId: payment.id,
        invoiceId: match.invoiceId,
        locationId: match.locationId,
        amount: payment.amount / 100,
        timestamp: new Date().toISOString(),
        errorDetails: {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        },
        retryCount: 0
      }), { ex: 86400 });

      // Notify about the failed update
      await notifyFailedInvoiceUpdate(match.locationId, {
        invoiceId: match.invoiceId,
        paymentId: payment.id,
        amount: payment.amount / 100,
        error: error.message
      });

      return res.status(200).json({
        received: true,
        matched: true,
        invoiceId: match.invoiceId,
        status: 'partial',
        message: 'Payment processed but invoice update failed',
        error: error.message
      });
    }
  } catch (error) {
    console.error("❌ Webhook error:", error);
    return res.status(200).json({ 
      received: true, 
      status: 'error',
      error: error.message 
    });
  }
}
