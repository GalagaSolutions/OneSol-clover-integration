import { createCloverCharge } from "../clover/create-charge.js";
import { getLocationToken } from "../utils/getLocationToken.js";
import axios from "axios";

export default async function handler(req, res) {
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

    // Validate required fields
    if (!locationId || !amount || !source) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: locationId, amount, or source"
      });
    }

    console.log("💰 Processing payment:");
    console.log("   Location ID:", locationId);
    console.log("   Amount:", amount, currency.toUpperCase());
    console.log("   Invoice ID:", invoiceId);

    // Verify Clover configuration first
    const { getCloverConfig, verifyCloverCredentials } = require('../utils/cloverConfig');
    const cloverConfig = await getCloverConfig(locationId);
    
    const verificationResult = await verifyCloverCredentials(
      cloverConfig.merchantId,
      cloverConfig.apiToken
    );

    if (!verificationResult.verified) {
      return res.status(400).json({
        success: false,
        error: "Clover integration not properly configured. Please complete the setup process.",
        code: "CLOVER_CONFIG_ERROR"
      });
    }

    // Create charge in Clover with verified credentials
    const cloverResult = await createCloverCharge({
      amount,
      currency,
      source,
      customerId,
      merchantId: cloverConfig.merchantId,
      apiToken: cloverConfig.apiToken,
      description: invoiceId ? `GHL Invoice ${invoiceId}` : `Payment from ${customerName || customerEmail}`,
      metadata: {
        locationId,
        invoiceId,
        customerEmail,
        customerName,
        source: "gohighlevel"
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

      // Try to update GHL invoice, but don't fail if it doesn't work
      let invoiceUpdated = false;
      let invoiceUpdateError = null;
      if (invoiceId) {
        try {
          const accessToken = await getLocationToken(locationId);
          await recordPaymentInGHL(locationId, invoiceId, accessToken, {
            amount,
            transactionId: cloverResult.transactionId,
          });
          console.log("✅ Payment recorded in GHL invoice");
          invoiceUpdated = true;
        } catch (error) {
          console.error("⚠️ Failed to update GHL invoice:", error.message);
          console.error("⚠️ Error details:", {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            url: error.config?.url
          });
          
          // Store detailed error information
          invoiceUpdateError = {
            message: "Payment was successful but invoice update failed",
            details: error.message,
            code: error.response?.status || 'UNKNOWN',
            reason: error.response?.data?.message || 'Unknown error',
            timestamp: new Date().toISOString(),
            paymentId: cloverResult.transactionId
          };

          // Store the failed update for retry
          await redis.set(
            `failed_invoice_update_${cloverResult.transactionId}`,
            JSON.stringify({
              invoiceId,
              locationId,
              paymentDetails: {
                amount,
                transactionId: cloverResult.transactionId
              },
              error: invoiceUpdateError,
              retryCount: 0
            }),
            { ex: 86400 } // Store for 24 hours for retry
          );

          console.log("💡 Payment successful in Clover but invoice update failed");
          console.log("💡 Payment details saved for retry. Manual sync may be required");
        }
      }    // Return success response (payment worked!)
    return res.status(200).json({
      success: true,
      transactionId: cloverResult.transactionId,
      amount: cloverResult.amount,
      currency: cloverResult.currency,
      status: cloverResult.status,
      card: cloverResult.card,
      message: "Payment processed successfully",
      invoiceUpdated: invoiceUpdated,
      warning: !invoiceUpdated && invoiceId ? "Payment successful but invoice not updated. Complete OAuth setup." : null
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
  console.log("   Invoice ID:", invoiceId);
  console.log("   Amount:", paymentData.amount);
  console.log("   Transaction ID:", paymentData.transactionId);
  
  // Use the payment orders API to record the transaction
  const paymentUrl = "https://services.leadconnectorhq.com/payments/orders";
  
  const payload = {
    altId: invoiceId,
    altType: "invoice",
    amount: paymentData.amount * 100, // Convert to cents
    currency: "usd",
    status: "succeeded",
    externalTransactionId: paymentData.transactionId,
    transactionType: "charge",
    paymentMode: "live"
  };
  
  console.log("📤 Payment payload:", JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(paymentUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-07-28",
      },
    });
    
    console.log("✅ Payment recorded in GHL");
    console.log("   Response:", JSON.stringify(response.data));
    
  } catch (error) {
    console.error("⚠️ Failed to record payment:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url
    });
    throw error;
  }
}