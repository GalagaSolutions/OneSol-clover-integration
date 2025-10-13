const { getLocationTokenFromRequest } = require('../../lib/getLocationToken');
const { matchPaymentToInvoice } = require('../../lib/paymentMatching');
const { updateInvoiceInGHL } = require('../../lib/ghlInvoiceUpdate');
const { getCloverConfig } = require('../../lib/cloverConfig');
const { Redis } = require('@upstash/redis');

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