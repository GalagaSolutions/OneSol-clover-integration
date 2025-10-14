# Clover-GoHighLevel Integration Setup Guide (V2 API)

## 📋 Overview

This integration connects Clover payment processing with GoHighLevel CRM using the **V2 Custom Provider API**, allowing:
- ✅ Online payments via GHL invoices, order forms, and payment links
- ✅ Physical Clover device payments updating GHL invoices (via webhooks)
- ✅ Automatic invoice status updates
- ✅ Transaction tracking and verification

---

## 🎯 Current Status

### Working ✅
- OAuth flow and token management
- Clover payment processing (sandbox tested $10)
- Payment form UI with Clover tokenization
- Transaction ID generation

### In Progress 🔄
- **GHL Invoice Updates**: Payments process but invoices don't update automatically
- **Integration Registration**: Need to properly register with GHL V2 API
- **Query URL Implementation**: Backend handlers for GHL payment requests

### Issue 🔍
The payment is successful in Clover but the GHL invoice doesn't update because:
1. Missing proper integration registration with GHL
2. Query URL not configured in app settings
3. GHL not calling our verification endpoint

---

## 🔧 Environment Variables

```bash
# GoHighLevel OAuth
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
OAUTH_REDIRECT_URI=https://api.onesolutionapp.com/oauth/callback

# Upstash Redis
storage_KV_REST_API_URL=your_upstash_url
storage_KV_REST_API_TOKEN=your_upstash_token

# Clover Credentials  
CLOVER_MERCHANT_ID=your_merchant_id
CLOVER_API_TOKEN=your_ecommerce_private_token
CLOVER_PAKMS_KEY=your_pakms_key_for_frontend
CLOVER_ENVIRONMENT=sandbox  # or 'production'

# Deployment
VERCEL_URL=api.onesolutionapp.com
```

---

## 📦 Serverless Functions (10/11 used)

1. `/api/oauth/callback.js` - OAuth completion + integration creation
2. `/api/setup.js` - Setup page UI for Clover credentials
3. `/api/config/save-clover-config.js` - Save config + update GHL
4. `/api/payment-form-simple.js` - Standalone payment form
5. `/api/payment/process.js` - Process standalone payments
6. `/api/payment/ghl-query.js` - **Query URL** - Handle GHL payment requests
7. `/api/payment-iframe.js` - **NEW** - Payment iframe for GHL (paymentsUrl)
8. `/api/payment/process-iframe.js` - **NEW** - Process iframe payments
9. `/api/webhooks/clover.js` - Receive device payment notifications
10. `/api/invoice/track.js` - Track invoices for webhook matching

**Utilities (not counted):**
- `/api/utils/getLocationToken.js` - Token refresh logic

---

## 🚀 Complete Setup Steps

### Step 1: GHL Marketplace App Configuration

**1.1 Go to Marketplace Dashboard:**
- URL: https://marketplace.gohighlevel.com
- Login with your GHL account

**1.2 Create New App:**
- Click **"Create App"**
- **Name:** Clover by PNC
- **Description:** Accept payments via Clover devices and online payment forms

**1.3 Settings Tab:**

**Scopes Required:**
```
contacts.readonly
contacts.write
invoices.readonly
invoices.write
payments/orders.readonly
payments/orders.write
payments/subscriptions.readonly
payments/transactions.readonly
payments/custom-provider.readonly
payments/custom-provider.write
products.readonly
products/prices.readonly
```

**OAuth Configuration:**
- **Redirect URL:** `https://api.onesolutionapp.com/oauth/callback`
- **Webhook URL:** `https://api.onesolutionapp.com/webhooks/ghl` (optional)

**Client Keys:**
- Copy Client ID and Client Secret
- Add to environment variables as `GHL_CLIENT_ID` and `GHL_CLIENT_SECRET`

**1.4 Payment Provider Tab:**

**Required Settings:**
- **Name:** Clover by PNC
- **Description:** Accept credit card payments through Clover
- **Logo:** Upload Clover logo image
- **Payment Provider Type:** Select all that apply:
  - ✅ **OneTime** (one-time payments)
  - ❌ Recurring (not supported yet)
  - ❌ Off Session (not supported yet)

**Critical URLs (V2 API):**
- **queryUrl:** `https://api.onesolutionapp.com/api/payment/query`
  - This handles verify, refund, and other backend operations
- **paymentsUrl:** `https://api.onesolutionapp.com/payment-form`
  - This is the iframe loaded for collecting payment info

**1.5 Profile Tab:**
- **Category:** **Third Party Provider** ⚠️ **CRITICAL!**
  - This makes your app show up in Payments > Integrations
  
**1.6 Custom Pages Tab:**
- **Custom Page URL:** `https://api.onesolutionapp.com/setup`
- This opens after installation to collect Clover credentials

**1.7 Save and Publish:**
- Click **Save**
- **Publish** to marketplace (or keep private for testing)

---

### Step 2: Clover Sandbox Configuration

**2.1 Access Clover Sandbox:**
- URL: https://sandbox.dev.clover.com
- Login with Clover developer account

**2.2 Get API Credentials:**

Navigate to: **Account & Setup → API Tokens**

**Create Ecommerce API Token:**
- Click **Create New Token**
- Name: "GHL Integration"
- Type: **Ecommerce** (not REST API!)
- Copy these values:
  - **Merchant ID** (e.g., `RCTSTAVI0010002`)
  - **API Token** (Private Token - starts with `a1b2c3...`)
  - **PAKMS Key** (Public Key - for frontend, starts with `clovertest_...`)

Add to environment variables:
```bash
CLOVER_MERCHANT_ID=your_merchant_id
CLOVER_API_TOKEN=your_api_token
CLOVER_PAKMS_KEY=your_pakms_key
CLOVER_ENVIRONMENT=sandbox
```

**2.3 Configure Webhook (for Device Payments):**

Navigate to: **Setup → Webhooks** or **Account & Setup → Webhooks**

**Add New Webhook:**
- **URL:** `https://api.onesolutionapp.com/webhooks/clover`
- **Events to Subscribe:**
  - ✅ `PAYMENT_CREATED`
  - ✅ `CREATE`
- **Status:** Active
- **Save**

**Test the Webhook:**
- Make a test payment on your Clover device
- Check Vercel logs for webhook receipt

---

### Step 3: Deploy to Vercel

**3.1 Push Code to GitHub**

**3.2 Connect to Vercel:**
- Import repository
- Add environment variables (all from above)

**3.3 Verify Deployment:**
```bash
# Check OAuth endpoint
https://api.onesolutionapp.com/oauth/callback

# Check setup page
https://api.onesolutionapp.com/setup

# Check query URL
curl -X POST https://api.onesolutionapp.com/api/payment/query \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'
```

---

### Step 4: Install App in GHL Sub-Account

**4.1 Get Installation URL:**
From marketplace dashboard, copy your app installation URL:
```
https://marketplace.gohighlevel.com/oauth/chooselocation?app_id=YOUR_APP_ID
```

**4.2 Install:**
- Open URL in browser
- **Choose location** (sub-account)
- Click **Install**
- **Authorize permissions**

**4.3 OAuth Flow:**
- Redirected to your OAuth callback
- Tokens exchanged and stored
- Integration created in GHL
- Redirected to setup page

**4.4 Complete Setup:**
- Enter Clover credentials:
  - Merchant ID
  - API Token
  - PAKMS Key (optional but recommended)
- Select **Test Mode**
- Click **Save Configuration**

**4.5 Verify Integration:**
- Go to GHL: **Settings → Payments → Integrations**
- You should see **"Clover by PNC"**
- Status should show as **Connected** or **Configured**
- If not showing, check Vercel logs for errors

---

## 🧪 Testing

### Test 1: OAuth and Setup ✅

**Check OAuth Flow:**
```bash
# Check if tokens stored
curl https://api.onesolutionapp.com/api/test/diagnostics?locationId=YOUR_LOCATION_ID
```

**Expected Response:**
```json
{
  "success": true,
  "locationId": "cv3mmKLIVdqbZSVeksCW",
  "hasAccessToken": true,
  "hasRefreshToken": true,
  "tokenExpires": "2025-10-15T...",
  "isExpired": false,
  "scopeCount": 12
}
```

### Test 2: Integration Registration 🔄

**Check if integration created:**
- Go to GHL: **Settings → Payments → Integrations**
- Look for "Clover by PNC"

**If not showing:**
```bash
# Check Vercel logs during OAuth flow
# Look for "Creating payment integration..." message
# Check for API errors
```

**Manual Registration Test:**
```bash
curl -X POST https://api.onesolutionapp.com/api/config/save-clover-config \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "YOUR_LOCATION_ID",
    "merchantId": "RCTSTAVI0010002",
    "apiToken": "your_api_token",
    "publicKey": "your_pakms_key",
    "liveMode": false
  }'
```

### Test 3: Standalone Payment Form ✅ WORKING

**Create Test Invoice in GHL:**
1. Go to **Payments → Invoices**
2. Create new invoice for $10.00
3. Copy invoice ID

**Access Payment Form:**
```
https://api.onesolutionapp.com/payment-form?amount=10.00&invoiceId=YOUR_INVOICE_ID&locationId=YOUR_LOCATION_ID&customerEmail=test@example.com&customerName=Test%20User
```

**Test Card:**
- **Number:** `4111 1111 1111 1111`
- **Exp:** Any future date (e.g., `12/26`)
- **CVV:** `123`
- **ZIP:** `12345`

**Expected Result:**
- ✅ Payment processes in Clover
- ✅ Transaction ID returned
- ⚠️ Invoice doesn't update (this is the issue we're fixing)

### Test 4: GHL-Initiated Payment (TO BE TESTED)

**Once integration is properly registered:**

1. **Create Invoice in GHL**
2. **Send to Customer** (or access yourself)
3. **Customer clicks "Pay Now"**
4. **GHL loads your payment iframe** (`paymentsUrl`)
5. **Customer enters card details**
6. **Payment processes**
7. **GHL calls queryUrl to verify**
8. **Invoice updates automatically** ✅

**To verify GHL is calling your endpoints:**
```bash
# Monitor Vercel logs in real-time
# Look for these log messages:
# "🔔 Query URL called from GHL"
# "✅ VERIFY request"
```

### Test 5: Clover Device Payment → Invoice Update

**Setup:**
1. Create invoice in GHL ($10.00)
2. Track invoice:
```bash
curl -X POST https://api.onesolutionapp.com/api/invoice/track \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "YOUR_LOCATION_ID",
    "invoiceId": "YOUR_INVOICE_ID",
    "amount": 10
  }'
```

**Process Payment:**
1. Charge $10.00 on Clover test device
2. (Optional) Add invoice ID in payment note

**Verify:**
- Check Vercel logs for:
  - `🔔 Webhook received from Clover`
  - `💳 Payment event detected!`
  - `🎯 Matched to invoice`
  - `✅ Invoice updated!`
- Check GHL invoice status

---

## 🔍 Troubleshooting

### Issue 1: Integration Not Showing in GHL

**Symptoms:**
- OAuth completes successfully
- Setup page loads
- But "Clover by PNC" doesn't appear in Payments → Integrations

**Causes:**
1. App category not set to "Third Party Provider"
2. Integration creation API call failed during OAuth
3. Wrong API endpoint or payload format

**Solutions:**

**Check App Category:**
- Go to Marketplace Dashboard → Your App → Profile
- Ensure **Category = "Third Party Provider"**
- Save and reinstall app

**Check Integration Creation:**
```bash
# View Vercel logs during OAuth
# Look for:
# "📤 Creating payment integration..."
# "✅ Payment integration created"

# Or errors like:
# "⚠️ Integration creation failed: ..."
```

**Manual Integration Creation:**
```bash
# Get your access token from diagnostics endpoint
# Then create integration:
curl -X POST https://services.leadconnectorhq.com/payments/custom-provider/connect \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Clover by PNC",
    "description": "Accept payments via Clover",
    "imageUrl": "https://www.clover.com/assets/images/public-site/press/clover_logo_primary.png",
    "locationId": "YOUR_LOCATION_ID",
    "queryUrl": "https://api.onesolutionapp.com/api/payment/query",
    "paymentsUrl": "https://api.onesolutionapp.com/payment-form"
  }'
```

### Issue 2: Payments Work But Invoice Doesn't Update

**Symptoms:**
- Payment processes successfully in Clover
- Transaction ID returned
- But GHL invoice stays "Unpaid"

**Current Status:** This is the main issue we're fixing

**Causes:**
1. GHL not calling your `queryUrl` for verification
2. Integration not properly registered
3. Query URL not configured in app settings

**Solutions:**

**Verify Query URL Configuration:**
- Marketplace Dashboard → Your App → Payment Provider
- Ensure **queryUrl** = `https://api.onesolutionapp.com/api/payment/query`
- Save

**Check if GHL Calls Your Endpoint:**
```bash
# Monitor Vercel logs during payment
# Should see:
# "🔔 Query URL called from GHL"
# "✅ VERIFY request"

# If you DON'T see these, GHL isn't calling you
```

**If GHL Isn't Calling:**
1. Integration not properly registered (see Issue 1)
2. Payment not initiated through GHL (use GHL invoice, not standalone form)
3. App not set as default payment provider

**Set as Default:**
- GHL: Settings → Payments → Integrations
- Find "Clover by PNC"
- Click **"Set as Default"**

### Issue 3: Clover Webhook Not Received

**Symptoms:**
- Device payment processed
- But GHL invoice doesn't update
- No webhook logs in Vercel

**Solutions:**

**Check Webhook Configuration:**
- Clover Dashboard → Setup → Webhooks
- Verify URL: `https://api.onesolutionapp.com/webhooks/clover`
- Verify Status: **Active**
- Verify Events: `PAYMENT_CREATED`, `CREATE`

**Test Webhook Manually:**
```bash
curl -X POST https://api.onesolutionapp.com/webhooks/clover \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PAYMENT_CREATED",
    "merchantId": "RCTSTAVI0010002",
    "objectId": "test_payment_id"
  }'

# Check Vercel logs for:
# "🔔 Webhook received from Clover"
```

**Check Webhook Logs in Clover:**
- Clover Dashboard → Setup → Webhooks
- Click on your webhook
- View "Recent Deliveries"
- Check for delivery failures

### Issue 4: API Key Verification Failed

**Symptoms:**
- Query URL called but returns 401
- Logs show "❌ Missing apiKey" or "❌ Invalid apiKey"

**Cause:**
- API key not properly stored during config save
- GHL sending wrong API key

**Solution:**
```bash
# Check if API key stored:
# Look in Redis for key pattern: api_key_*

# Regenerate by re-saving config:
curl -X POST https://api.onesolutionapp.com/api/config/save-clover-config \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "YOUR_LOCATION_ID",
    "merchantId": "RCTSTAVI0010002",
    "apiToken": "your_token",
    "liveMode": false
  }'
```

---

## 📊 API Flow Diagrams

### Flow 1: GHL-Initiated Payment (How it SHOULD work)

```
1. Customer receives GHL invoice
   ↓
2. Clicks "Pay Now" in email/SMS
   ↓
3. GHL loads YOUR paymentsUrl in iframe
   (/payment-form)
   ↓
4. Iframe sends "ready" event to GHL
   ↓
5. GHL sends payment data to iframe
   (amount, customer, orderId, etc.)
   ↓
6. Customer enters card details
   Clover tokenizes card
   ↓
7. Iframe sends token to YOUR backend
   (/api/payment/process-iframe)
   ↓
8. YOUR backend processes with Clover
   Returns chargeId
   ↓
9. Iframe sends success event to GHL
   with chargeId
   ↓
10. GHL calls YOUR queryUrl
    type: "verify"
    chargeId: "clv_xxx"
    ↓
11. YOUR queryUrl returns
    { success: true }
    ↓
12. GHL marks invoice as PAID ✅
```

### Flow 2: Device Payment → Invoice Update

```
1. Customer pays on Clover device
   ↓
2. Clover sends webhook to YOUR server
   ↓
3. YOUR webhook handler receives payment
   ↓
4. Match payment to invoice:
   - By amount + timestamp
   - By invoice ID in payment note
   ↓
5. If match found:
   Get GHL access token
   ↓
6. Call GHL API to record payment
   (using payment orders API)
   ↓
7. GHL invoice updated ✅
```

---

## 🎯 Next Steps

### Immediate (To Fix Invoice Updates):

1. **Verify Integration Registration**
   - Check if "Clover by PNC" shows in GHL Integrations
   - If not, debug OAuth callback integration creation

2. **Test GHL-Initiated Payment**
   - Create invoice in GHL
   - Try to pay through GHL (not standalone form)
   - Monitor logs to see if GHL calls queryUrl

3. **Verify API Keys**
   - Ensure provider config saved correctly
   - Check Redis for api_key_* entries

### Short-term (Additional Features):

1. **Webhook Optimization**
   - Test device payment → invoice matching
   - Improve matching algorithm (multiple strategies)

2. **Error Handling**
   - Better error messages
   - Retry logic for failed API calls

3. **Admin Tools**
   - Dashboard to view transactions
   - Manual invoice update tool
   - Diagnostic tools

### Long-term (Future Enhancements):

1. **Recurring Payments**
   - Implement subscription support
   - Handle subscription webhooks

2. **Saved Payment Methods**
   - Card on file support
   - List/charge saved cards

3. **Production Launch**
   - Switch to Clover production
   - Get live credentials
   - Submit for GHL marketplace approval

---

## 📞 Support Resources

**Vercel Logs:**
```
https://vercel.com/your-project/deployments
```

**Diagnostics Endpoint:**
```
https://api.onesolutionapp.com/api/test/diagnostics?locationId=YOUR_ID
```

**GHL API Documentation:**
- Custom Provider: https://help.gohighlevel.com/support/solutions/articles/155000002620
- API Reference: https://marketplace.gohighlevel.com/docs/

**Clover Documentation:**
- Ecommerce API: https://docs.clover.com/docs/ecommerce-overview
- Webhooks: https://docs.clover.com/docs/webhooks

---

## ✅ Checklist

### OAuth Setup
- [ ] GHL app created in marketplace
- [ ] Category set to "Third Party Provider"
- [ ] OAuth scopes configured
- [ ] Client keys added to env vars
- [ ] Redirect URL configured

### Payment Provider Setup
- [ ] queryUrl configured: `/api/payment/query`
- [ ] paymentsUrl configured: `/payment-form`
- [ ] Payment types selected (OneTime)
- [ ] Logo uploaded

### Clover Setup
- [ ] Sandbox account created
- [ ] Ecommerce API token generated
- [ ] PAKMS key obtained
- [ ] Credentials added to env vars
- [ ] Webhook configured

### Deployment
- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] All env vars added
- [ ] Deployment successful
- [ ] Endpoints accessible

### Testing
- [ ] App installed in GHL sub-account
- [ ] OAuth flow completed
- [ ] Setup page loads
- [ ] Clover config saved
- [ ] Integration shows in GHL
- [ ] Standalone payment works
- [ ] GHL-initiated payment works
- [ ] Invoice updates automatically
- [ ] Device payment webhook works

---

**Last Updated:** October 14, 2025
**Integration Version:** 1.0 (V2 API)
**Status:** Payments working, invoice updates in progress