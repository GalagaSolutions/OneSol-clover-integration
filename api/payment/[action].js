import { createCloverCharge } from "../../lib/clover/createCharge.js";
import { getLocationToken } from "../../lib/getLocationToken.js";
import { recordPaymentOrder } from "../../lib/ghl/payments.js";
import { renderPaymentFormPage } from "../../lib/templates/paymentForm.js";

const ACTION_HANDLERS = {
  async process(req, res) {
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
          error: "Missing required fields: locationId, amount, or source",
        });
      }

      console.log("💰 Processing payment:");
      console.log("   Location ID:", locationId);
      console.log("   Amount:", amount, currency.toUpperCase());
      console.log("   Invoice ID:", invoiceId);

      const cloverResult = await createCloverCharge({
        amount,
        currency,
        source,
        customerId,
        description: invoiceId
          ? `GHL Invoice ${invoiceId}`
          : `Payment from ${customerName || customerEmail}`,
        metadata: {
          locationId,
          invoiceId,
          customerEmail,
          customerName,
          source: "gohighlevel",
        },
      });

      if (!cloverResult.success) {
        return res.status(400).json({
          success: false,
          error: cloverResult.error,
          code: cloverResult.code,
        });
      }

      console.log("✅ Payment successful in Clover!");

      let invoiceUpdated = false;
      if (invoiceId) {
        try {
          const accessToken = await getLocationToken(locationId);
          await recordPaymentOrder({
            accessToken,
            locationId,
            invoiceId,
            amount,
            transactionId: cloverResult.transactionId,
            currency,
          });
          console.log("✅ Payment recorded in GHL invoice");
          invoiceUpdated = true;
        } catch (error) {
          console.error("⚠️ Failed to update GHL invoice:", error.message);
          console.error("⚠️ Error details:", {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            url: error.config?.url,
          });
          console.log("💡 Payment still succeeded, but couldn't update GHL invoice");
          console.log("💡 User needs to complete OAuth flow to enable invoice updates");
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
        invoiceUpdated,
        warning:
          !invoiceUpdated && invoiceId
            ? "Payment successful but invoice not updated. Complete OAuth setup."
            : null,
      });
    } catch (error) {
      console.error("❌ Payment processing error:", error);

      return res.status(500).json({
        success: false,
        error: "Payment processing failed",
        message: error.message,
      });
    }
  },

  async "form-simple"(req, res) {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      amount = "0.00",
      invoiceId = "",
      locationId = "",
      customerEmail = "",
      customerName = "",
    } = req.query;

    const pakmsKey = process.env.CLOVER_PAKMS_KEY || "";
    const merchantId = process.env.CLOVER_MERCHANT_ID || "RCTSTAVI0010002";
    const cloverKey = pakmsKey || merchantId;

    const html = renderPaymentFormPage({
      amount,
      invoiceId,
      locationId,
      customerEmail,
      customerName,
      pakmsKey,
      merchantId,
      cloverKey,
    });

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  },

  async clover(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { locationId, amount, currency, customerId, paymentMethod } = req.body;

      if (!locationId || !amount) {
        return res
          .status(400)
          .json({ error: "Missing required fields: locationId and amount" });
      }

      console.log("💳 Processing payment for location:", locationId);

      const accessToken = await getLocationToken(locationId);

      const cloverResponse = await processCloverPayment({
        amount,
        currency: currency || "usd",
        customerId,
        paymentMethod,
      });

      console.log("✅ Clover payment processed:", cloverResponse.id);

      await reportPaymentToGHL(accessToken, {
        amount,
        currency: currency || "usd",
        status: "succeeded",
        externalTransactionId: cloverResponse.id,
        locationId,
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
  },
};

export default async function handler(req, res) {
  const actionParam = req.query.action;
  const action = Array.isArray(actionParam) ? actionParam[0] : actionParam;

  const handler = action ? ACTION_HANDLERS[action] : null;
  if (!handler) {
    return res.status(404).json({ error: "Not found" });
  }

  return handler(req, res);
}

async function processCloverPayment(paymentData) {
  console.log("🔄 Processing Clover payment:", paymentData);

  return {
    id: `clover_${Date.now()}`,
    status: "succeeded",
    amount: paymentData.amount,
  };
}

async function reportPaymentToGHL(accessToken, paymentData) {
  const liveMode = paymentData.live ?? true;

  await recordPaymentOrder({
    accessToken,
    locationId: paymentData.locationId,
    invoiceId: paymentData.invoiceId,
    amount: paymentData.amount,
    transactionId: paymentData.externalTransactionId,
    currency: paymentData.currency,
    paymentMode: liveMode ? "live" : "test",
  });

  console.log("✅ Payment reported to GHL");
}
