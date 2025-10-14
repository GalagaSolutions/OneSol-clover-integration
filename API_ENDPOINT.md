# API Endpoints Reference

## 🔗 Public Endpoints

### OAuth & Installation

**OAuth Callback**
```
GET https://api.onesolutionapp.com/oauth/callback?code=xxx
```
- Exchanges OAuth code for access token
- Creates integration in GHL
- Redirects to setup page
- **Called by:** GHL during app installation

**Setup Page**
```
GET https://api.onesolutionapp.com/setup?locationId=xxx&companyId=xxx
```
- UI for collecting Clover credentials
- **Called by:** User after OAuth (automatic redirect)

---

## 💳 Payment Processing

### Standalone Payment Form
```
GET https://api.onesolutionapp.com/payment-form?amount=10.00&invoiceId=xxx&locationId=xxx&customerEmail=test@example.com&customerName=Test%20User
```
- Direct payment form (not through GHL)
- Uses Clover iframe tokenization
- **Called by:** Direct link (email, SMS, etc.)
- **Status:** ✅ Working (but doesn't update GHL invoice yet)

### Process Standalone Payment
```
POST https://api.onesolutionapp.com/api/payment/process
{
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "amount": 10.00,
  "currency": "usd",
  "source": "clv_token_xxx",
  "invoiceId": "68db1e4f6bff8375541bf057",
  "customerEmail": "test@example.com",
  "customerName": "Test User"
}
```
- Processes payment through Clover
- Attempts to update GHL invoice
- **Called by:** Payment form frontend
- **Status:** ✅ Payment works, ⚠️ Invoice update pending

### GHL Payment Iframe (paymentsUrl)
```
GET https://api.onesolutionapp.com/payment-form
```
- Loaded by GHL in iframe
- Implements iframe communication protocol
- Sends ready/success/error events to parent
- **Called by:** GHL when customer pays invoice
- **Status:** 🔄 Ready to test once integration registered

### Process Iframe Payment
```
POST https://api.onesolutionapp.com/api/payment/process-iframe
{
  "source": "clv_token_xxx",
  "amount": 10.00,
  "currency": "usd",
  "orderId": "ghl_order_id",
  "transactionId": "ghl_txn_id",
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "contact": {
    "id": "contact_id",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```
- Backend processor for iframe payments
- Stores transaction for verification
- **Called by:** Payment iframe frontend
- **Status:** 🔄 Ready for testing

---

## 🔍 Query URL (GHL Backend Calls)

### Main Query Handler
```
POST https://api.onesolutionapp.com/api/payment/query
```
**Called by:** GHL for various payment operations

### Verify Payment
```json
{
  "type": "verify",
  "transactionId": "ghl_transaction_id",
  "apiKey": "sk_xxxxx",
  "chargeId": "clv_charge_id",
  "subscriptionId": "ghl_subscription_id" // optional
}
```
**Response:**
```json
{ "success": true }  // or { "failed": true }
```

### Refund Payment
```json
{
  "type": "refund",
  "amount": 100,
  "transactionId": "ghl_transaction_id",
  "apiKey": "sk_xxxxx"
}
```
**Response:**
```json
{ "success": true }  // or { "failed": true, "message": "error" }
```

### List Payment Methods
```json
{
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "contactId": "W1nPA7y2Dv8oL1MEvs2A",
  "apiKey": "sk_xxxxx",
  "type": "list_payment_methods"
}
```
**Response:**
```json
[]  // Empty - card on file not supported
```

### Charge Saved Payment Method
```json
{
  "paymentMethodId": "pm_xxxxx",
  "contactId": "W1nPA7y2Dv8oL1MEvs2A",
  "transactionId": "680a923d54b81c699b845e47",
  "chargeDescription": "Invoice - 1",
  "amount": 100.00,
  "currency": "USD",
  "apiKey": "sk_xxxxx",
  "type": "charge_payment"
}
```
**Response:**
```json
{ "failed": true, "message": "Saved payment methods not supported" }
```

**Status:** 🔄 Implemented, waiting for GHL to call

---

## 🔔 Webhooks

### Clover Device Payment Webhook
```
POST https://api.onesolutionapp.com/webhooks/clover
{
  "type": "PAYMENT_CREATED",
  "merchantId": "RCTSTAVI0010002",
  "objectId": "payment_id_xxx"
}
```
- Receives device payment notifications
- Matches payment to pending invoice
- Updates GHL invoice status
- **Called by:** Clover when device payment processed
- **Status:** ✅ Implemented, needs testing

---

## ⚙️ Configuration

### Save Clover Configuration
```
POST https://api.onesolutionapp.com/api/config/save-clover-config
{
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "merchantId": "RCTSTAVI0010002",
  "apiToken": "your_clover_api_token",
  "publicKey": "clovertest_xxxxx",
  "liveMode": false
}
```
- Saves Clover credentials
- Updates GHL provider config
- Generates API keys
- **Called by:** Setup page form
- **Status:** ✅ Working

---

## 📝 Utilities

### Track Invoice for Matching
```
POST https://api.onesolutionapp.com/api/invoice/track
{
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "invoiceId": "68db1e4f6bff8375541bf057",
  "amount": 10.00
}
```
- Tracks invoice for device payment matching
- Expires after 1 hour
- **Called by:** Payment form before showing
- **Status:** ✅ Working

### Diagnostics
```
GET https://api.onesolutionapp.com/api/test/diagnostics?locationId=cv3mmKLIVdqbZSVeksCW
```
**Response:**
```json
{
  "success": true,
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "hasAccessToken": true,
  "hasRefreshToken": true,
  "tokenExpires": "2025-10-15T16:49:34.000Z",
  "isExpired": false,
  "installedAt": "2025-10-14T16:49:34.000Z",
  "companyId": "xxx",
  "scopes": "contacts.readonly contacts.write...",
  "scopeCount": 12
}
```

### Check Clover Connection
```
GET https://api.onesolutionapp.com/setup?test=clover
```
**Response:**
```json
{
  "connected": true,
  "merchantId": "RCST...",
  "hasApiToken": true,
  "hasPakmsKey": true,
  "environment": "sandbox"
}
```

---

## 🔐 Authentication

### GHL API Calls
**Header:**
```
Authorization: Bearer {access_token}
Version: 2021-07-28
Content-Type: application/json
```

### Query URL Calls (from GHL)
**Body includes:**
```json
{
  "apiKey": "sk_xxxxx"  // Your generated API key
}
```

### Clover API Calls
**Header:**
```
Authorization: Bearer {CLOVER_API_TOKEN}
Content-Type: application/json
```

---

## 📊 Data Storage (Redis)

### Token Storage
```
Key: ghl_location_{locationId}
Value: {
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": 1234567890,
  "locationId": "...",
  "companyId": "...",
  "scope": "...",
  "installedAt": "..."
}
```

### Clover Config Storage
```
Key: clover_config_{locationId}
Value: {
  "merchantId": "...",
  "apiToken": "...",
  "publicKey": "...",
  "liveMode": false,
  "configuredAt": "..."
}
```

### API Key Mapping
```
Key: api_key_{apiKey}
Value: {
  "locationId": "...",
  "createdAt": "..."
}
```

### Transaction Storage
```
Key: transaction_{cloverChargeId}
Value: {
  "chargeId": "...",
  "ghlTransactionId": "...",
  "ghlOrderId": "...",
  "amount": 10.00,
  "currency": "usd",
  "status": "succeeded",
  "contactId": "...",
  "locationId": "...",
  "timestamp": 1234567890
}
TTL: 7 days
```

### GHL Transaction Mapping
```
Key: ghl_transaction_{ghlTransactionId}
Value: {
  "chargeId": "clv_xxx",
  "timestamp": 1234567890
}
TTL: 7 days
```

### Pending Invoice Tracking
```
Key: pending_invoice_{amountInCents}
Value: {
  "locationId": "...",
  "invoiceId": "...",
  "amount": 1000,
  "timestamp": 1234567890
}
TTL: 1 hour
```

---

## 🧪 Test Requests

### Test OAuth Flow
```bash
# Visit in browser:
https://marketplace.gohighlevel.com/oauth/chooselocation?app_id=YOUR_APP_ID
```

### Test Payment Form
```bash
# Visit in browser:
https://api.onesolutionapp.com/payment-form?amount=10.00&invoiceId=test_inv_123&locationId=cv3mmKLIVdqbZSVeksCW&customerEmail=test@example.com&customerName=Test%20User
```

### Test Clover Webhook
```bash
curl -X POST https://api.onesolutionapp.com/webhooks/clover \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PAYMENT_CREATED",
    "merchantId": "RCTSTAVI0010002",
    "objectId": "test_payment_123"
  }'
```

### Test Query URL - Verify
```bash
curl -X POST https://api.onesolutionapp.com/api/payment/query \
  -H "Content-Type: application/json" \
  -d '{
    "type": "verify",
    "transactionId": "ghl_txn_123",
    "apiKey": "sk_your_api_key",
    "chargeId": "clv_charge_123"
  }'
```

### Test Configuration Save
```bash
curl -X POST https://api.onesolutionapp.com/api/config/save-clover-config \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "cv3mmKLIVdqbZSVeksCW",
    "merchantId": "RCTSTAVI0010002",
    "apiToken": "your_token",
    "publicKey": "clovertest_xxx",
    "liveMode": false
  }'
```

### Test Diagnostics
```bash
curl "https://api.onesolutionapp.com/api/test/diagnostics?locationId=cv3mmKLIVdqbZSVeksCW"
```

---

## 🔄 Request/Response Flow

### Complete Payment Flow (GHL-Initiated)

```
1. Customer → GHL Invoice "Pay" button

2. GHL → Loads iframe
   GET https://api.onesolutionapp.com/payment-form
   
3. Iframe → Sends ready event
   postMessage({ type: 'custom_provider_ready', loaded: true })
   
4. GHL → Sends payment data
   postMessage({
     type: 'payment_initiate_props',
     publishableKey: 'pk_xxx',
     amount: 10.00,
     currency: 'USD',
     orderId: 'ghl_order_123',
     transactionId: 'ghl_txn_456',
     contact: {...}
   })
   
5. Iframe → Customer enters card
   Clover tokenizes → token: 'clv_token_xxx'
   
6. Iframe → Backend
   POST /api/payment/process-iframe
   { source: 'clv_token_xxx', amount: 10.00, ... }
   
7. Backend → Clover Charge API
   POST https://scl-sandbox.dev.clover.com/v1/charges
   Response: { id: 'clv_charge_xxx', status: 'succeeded' }
   
8. Backend → Iframe
   { success: true, chargeId: 'clv_charge_xxx' }
   
9. Iframe → GHL
   postMessage({
     type: 'custom_element_success_response',
     chargeId: 'clv_charge_xxx'
   })
   
10. GHL → Query URL (Verify)
    POST /api/payment/query
    { type: 'verify', chargeId: 'clv_charge_xxx', apiKey: 'sk_xxx' }
    
11. Query URL → GHL
    { success: true }
    
12. GHL → Updates invoice to PAID ✅
```

---

## 📱 Testing Credentials

### Clover Test Cards
```
Visa: 4111 1111 1111 1111
Mastercard: 5555 5555 5555 4444
Amex: 3782 822463 10005
Discover: 6011 1111 1111 1117

Expiry: Any future date
CVV: Any 3-4 digits
ZIP: Any 5 digits
```

### Test Merchant
```
Merchant ID: RCTSTAVI0010002
Environment: sandbox
```

---

## 🚨 Common Error Responses

### 401 Unauthorized
```json
{
  "error": "Unauthorized - missing apiKey"
}
```
**Cause:** Missing or invalid API key in request

### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required fields"
}
```
**Cause:** Required fields missing from request

### 500 Server Error
```json
{
  "success": false,
  "error": "Payment processing failed",
  "message": "Detailed error message"
}
```
**Cause:** Backend processing error

### Clover Errors
```json
{
  "success": false,
  "error": "Payment declined",
  "code": "card_declined"
}
```

---

## 📈 Status Legend

- ✅ **Working** - Tested and functional
- 🔄 **Ready** - Implemented, needs testing
- ⚠️ **Partial** - Works but has issues
- ❌ **Not Working** - Known issue
- 🚧 **In Progress** - Currently being developed