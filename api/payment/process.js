import { createCloverCharge } from "../clover/create-charge.js";
import { getLocationToken } from "../utils/getLocationToken.js";
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      locationId,      // GHL location ID
      invoiceId,       // GHL invoice ID (optional)
      amount,
      currency = "usd",
      source,          // Clover payment token from frontend
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

    // Verify GHL location has OAuth access
    try {
      await getLocationToken(locationId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Location not connected. Please install the app first."
      });
    }

    // Create charge in YOUR Clover account
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

    // Update GHL invoice if provided
    if (invoiceId) {
      try {
        await recordPaymentInGHL(locationId, invoiceId, {
          amount,
          transactionId: cloverResult.transactionId,
        });
        console.log("✅ Payment recorded in GHL invoice");
      } catch (error) {
        console.error("⚠️ Failed to update GHL invoice:", error.message);
        // Don't fail the payment if GHL update fails
      }
    }

    return res.status(200).json({
      success: true,
      transactionId: cloverResult.transactionId,
      amount: cloverResult.amount,
      currency: cloverResult.currency,
      status: cloverResult.status,
      card: cloverResult.card,
      message: "Payment processed successfully"
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

async function recordPaymentInGHL(locationId, invoiceId, paymentData) {
  const accessToken = await getLocationToken(locationId);
  
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