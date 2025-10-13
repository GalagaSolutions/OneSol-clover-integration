import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

import { recordPaymentOrder } from '../lib/ghl/payments.js';
import { createCloverCharge } from '../lib/clover/createCharge.js';

const originalAxiosPost = axios.post;
const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

function restoreAxios() {
  axios.post = originalAxiosPost;
}

test('recordPaymentOrder throws when access token missing', async () => {
  await assert.rejects(
    () =>
      recordPaymentOrder({
        accessToken: '',
        locationId: 'loc_123',
        amount: 10,
      }),
    /Access token required/
  );
});

test('recordPaymentOrder throws when location ID missing', async () => {
  await assert.rejects(
    () =>
      recordPaymentOrder({
        accessToken: 'token',
        locationId: '',
        amount: 10,
      }),
    /Location ID required/
  );
});

test('recordPaymentOrder posts normalized payload to GHL', async () => {
  let receivedUrl;
  let receivedPayload;
  let receivedHeaders;

  axios.post = async (url, payload, { headers }) => {
    receivedUrl = url;
    receivedPayload = payload;
    receivedHeaders = headers;
    return { data: { success: true } };
  };

  try {
    const result = await recordPaymentOrder({
      accessToken: 'access',
      locationId: 'loc_1',
      invoiceId: 'inv_9',
      amount: 12.34,
      transactionId: 'txn_55',
      currency: 'USD',
      paymentMode: 'test',
    });

    assert.deepEqual(result, { success: true });
    assert.equal(
      receivedUrl,
      'https://services.leadconnectorhq.com/v2/payments/orders'
    );
    assert.deepEqual(receivedPayload, {
      altId: 'inv_9',
      altType: 'invoice',
      amount: 1234,
      currency: 'usd',
      status: 'succeeded',
      externalTransactionId: 'txn_55',
      transactionType: 'charge',
      paymentMode: 'test',
    });
    assert.equal(receivedHeaders['Location-Id'], 'loc_1');
    assert.equal(receivedHeaders.Authorization, 'Bearer access');
  } finally {
    restoreAxios();
  }
});

function setCloverEnv() {
  process.env.CLOVER_PAKMS_KEY = 'pakms_123';
  process.env.CLOVER_API_TOKEN = 'api_1234567890';
  process.env.CLOVER_ENVIRONMENT = 'sandbox';
}

test('createCloverCharge fails when configuration missing', async () => {
  resetEnv();
  restoreAxios();

  delete process.env.CLOVER_PAKMS_KEY;
  delete process.env.CLOVER_API_TOKEN;

  const result = await createCloverCharge({
    amount: 25,
    source: 'tok_test',
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'config_error');
});

test('createCloverCharge posts expected payload to Clover', async () => {
  resetEnv();
  restoreAxios();
  setCloverEnv();

  let capturedUrl;
  let capturedPayload;
  let capturedHeaders;

  axios.post = async (url, payload, { headers }) => {
    capturedUrl = url;
    capturedPayload = payload;
    capturedHeaders = headers;
    return {
      data: {
        id: 'clover_txn_1',
        status: 'succeeded',
        amount: 2500,
        currency: 'usd',
        created: 1700000000,
        source: { brand: 'visa', last4: '4242' },
      },
    };
  };

  try {
    const result = await createCloverCharge({
      amount: 25,
      currency: 'USD',
      source: 'tok_test',
      description: 'Test charge',
      metadata: { invoiceId: 'inv_1' },
    });

    assert.equal(result.success, true);
    assert.equal(result.transactionId, 'clover_txn_1');
    assert.equal(capturedUrl, 'https://scl-sandbox.dev.clover.com/v1/charges');
    assert.deepEqual(capturedPayload, {
      amount: 2500,
      currency: 'usd',
      source: 'tok_test',
      capture: true,
      description: 'Test charge',
      ecomind: 'ecom',
      metadata: {
        invoiceId: 'inv_1',
        integration: 'gohighlevel',
        processor: 'clover',
      },
    });
    assert.equal(capturedHeaders.Authorization, 'Bearer api_1234567890');
    assert.equal(capturedHeaders['X-Clover-Auth'], 'api_1234567890');
  } finally {
    restoreAxios();
  }
});

test('createCloverCharge maps HTTP errors to friendly messages', async () => {
  resetEnv();
  restoreAxios();
  setCloverEnv();

  axios.post = async () => {
    const error = new Error('Bad Request');
    error.response = {
      status: 400,
      data: { message: 'Invalid request data', code: 'invalid_source' },
    };
    throw error;
  };

  try {
    const result = await createCloverCharge({
      amount: 10,
      source: 'tok_bad',
    });

    assert.equal(result.success, false);
    assert.equal(result.error, 'Invalid request data');
    assert.equal(result.code, 'invalid_source');
  } finally {
    restoreAxios();
  }
});

process.on('exit', () => {
  resetEnv();
  restoreAxios();
});
