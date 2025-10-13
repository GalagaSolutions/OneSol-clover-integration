// api/payment/[action].js
import { createCloverCharge } from "../utils/cloverOperations";
import { getLocationToken } from "../utils/getLocationToken";
import { recordPaymentInGHL } from "../utils/ghlInvoiceUpdate";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.storage_KV_REST_API_URL,
  token: process.env.storage_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  const { action } = req.query;

  switch (action) {
    case 'process':
      return handlePaymentProcess(req, res);
    case 'form':
      return handlePaymentForm(req, res);
    case 'track':
      return handleInvoiceTracking(req, res);
    case 'create-charge':
      return handleCreateCharge(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}

// Handlers moved from:
// - payment/process.js
// - payment-form-simple.js
// - pay/clover.js
// - invoice/track.js
// - clover/create-charge.js