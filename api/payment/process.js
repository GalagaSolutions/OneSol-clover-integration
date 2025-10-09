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

    // Create charge in Clover (this is working! ✅)
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
        // Don't fail the payment - just log it
        console.log("💡 Payment still succeeded, but couldn't update GHL invoice");
        console.log("💡 User needs to complete OAuth flow to enable invoice updates");
      }
    }

    // Return success response (payment worked!)
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
  const url = `https://services.leadconnectorhq.com/invoices/${invoiceId}/record-payment`;
  
  await axios.post(url, {
    amount: paymentData.amount,
    paymentMode: "custom",
    transactionId: paymentData.transactionId,
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
  });
}