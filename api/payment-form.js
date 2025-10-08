export default function handler(req, res) {
  const { amount = '0.00', invoiceId = '', locationId = 'cv3mmKLIVdqbZSVeksCW', customerEmail = '', customerName = '' } = req.query;
  
  const merchantId = process.env.CLOVER_MERCHANT_ID || 'RCTSTAVI0010002';

  // Build invoice info section
  let invoiceInfoHTML = '';
  if (invoiceId) {
    invoiceInfoHTML = `<div class="invoice-info">
      <div><strong>Invoice:</strong> ${invoiceId}</div>
      ${customerName ? `<div><strong>Customer:</strong> ${customerName}</div>` : ''}
      ${customerEmail ? `<div><strong>Email:</strong> ${customerEmail}</div>` : ''}
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment - Clover by PNC</title>
    
    <script src="https://checkout.sandbox.dev.clover.com/sdk.js"></script>
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .payment-container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 450px;
            width: 100%;
            padding: 40px;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .logo svg {
            width: 60px;
            height: 60px;
        }
        
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 8px;
            font-size: 24px;
        }
        
        .amount {
            text-align: center;
            font-size: 36px;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 30px;
        }
        
        .invoice-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            font-size: 14px;
            color: #666;
        }
        
        .invoice-info div {
            margin-bottom: 5px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            font-size: 14px;
        }
        
        .clover-input {
            width: 100%;
            padding: 14px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
            background: white;
        }
        
        .clover-input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .card-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        
        .btn-pay {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 10px;
        }
        
        .btn-pay:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        
        .btn-pay:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
        }
        
        .message {
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            font-size: 14px;
        }
        
        .message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .secure-badge {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #999;
        }
        
        .secure-badge svg {
            width: 16px;
            height: 16px;
            vertical-align: middle;
            margin-right: 5px;
        }
        
        .spinner {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
            margin-right: 10px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .success-icon {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .success-icon svg {
            width: 80px;
            height: 80px;
        }
    </style>
</head>
<body>
    <div class="payment-container" id="paymentContainer">
        <div class="logo">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="45" fill="#FF6B35"/>
                <path d="M30 50 L45 65 L70 35" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        
        <h1>Complete Payment</h1>
        <div class="amount">$${amount}</div>
        
        ${invoiceInfoHTML}
        
        <form id="paymentForm">
            <div class="form-group">
                <label for="cardNumber">Card Number</label>
                <div id="card-number" class="clover-input"></div>
            </div>
            
            <div class="card-row">
                <div class="form-group">
                    <label for="cardExpiry">Expiry Date</label>
                    <div id="card-date" class="clover-input"></div>
                </div>
                
                <div class="form-group">
                    <label for="cardCvv">CVV</label>
                    <div id="card-cvv" class="clover-input"></div>
                </div>
            </div>
            
            <div class="form-group">
                <label for="cardZip">ZIP Code</label>
                <div id="card-postal-code" class="clover-input"></div>
            </div>
            
            <button type="submit" id="payButton" class="btn-pay">
                Pay $${amount}
            </button>
            
            <div id="message" class="message"></div>
        </form>
        
        <div class="secure-badge">
            <svg fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
            </svg>
            Secure payment powered by Clover
        </div>
    </div>
    
    <script>
        const paymentData = {
            locationId: '${locationId}',
            invoiceId: '${invoiceId}',
            amount: parseFloat('${amount}'),
            customerEmail: '${customerEmail}',
            customerName: '${customerName}'
        };
        
        const clover = new Clover('${merchantId}');
        const elements = clover.elements();
        
        const styles = {
            body: {
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
                fontSize: '16px',
            },
            input: {
                fontSize: '16px',
            }
        };
        
        const cardNumber = elements.create('CARD_NUMBER', styles);
        const cardDate = elements.create('CARD_DATE', styles);
        const cardCvv = elements.create('CARD_CVV', styles);
        const cardPostalCode = elements.create('CARD_POSTAL_CODE', styles);
        
        cardNumber.mount('#card-number');
        cardDate.mount('#card-date');
        cardCvv.mount('#card-cvv');
        cardPostalCode.mount('#card-postal-code');
        
        document.getElementById('paymentForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const payButton = document.getElementById('payButton');
            const originalText = payButton.innerHTML;
            
            payButton.disabled = true;
            payButton.innerHTML = '<span class="spinner"></span> Processing...';
            
            try {
                const result = await clover.createToken();
                
                if (result.errors) {
                    throw new Error(result.errors[0].message || 'Card validation failed');
                }
                
                const response = await fetch('/api/payment/process', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        locationId: paymentData.locationId,
                        invoiceId: paymentData.invoiceId,
                        amount: paymentData.amount,
                        currency: 'usd',
                        source: result.token,
                        customerEmail: paymentData.customerEmail,
                        customerName: paymentData.customerName,
                    })
                });
                
                const paymentResult = await response.json();
                
                if (paymentResult.success) {
                    showSuccess(paymentResult);
                } else {
                    throw new Error(paymentResult.error || 'Payment failed');
                }
                
            } catch (error) {
                console.error('Payment error:', error);
                showMessage('error', error.message || 'Payment failed. Please try again.');
                payButton.disabled = false;
                payButton.innerHTML = originalText;
            }
        });
        
        function showMessage(type, text) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = 'message ' + type;
            messageDiv.textContent = text;
            messageDiv.style.display = 'block';
        }
        
        function showSuccess(result) {
            document.getElementById('paymentContainer').innerHTML = 
                '<div class="success-icon">' +
                '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
                '<circle cx="50" cy="50" r="45" fill="#4CAF50"/>' +
                '<path d="M30 50 L45 65 L70 35" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>' +
                '</div>' +
                '<h1 style="color: #4CAF50; margin-bottom: 15px;">Payment Successful!</h1>' +
                '<div style="text-align: center; color: #666; margin-bottom: 20px;">' +
                '<div style="font-size: 14px; margin-bottom: 10px;">' +
                'Amount: <strong>$' + result.amount + '</strong>' +
                '</div>' +
                '<div style="font-size: 12px; color: #999;">' +
                'Transaction ID: ' + result.transactionId +
                '</div>' +
                '</div>' +
                '<div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">' +
                '<p style="font-size: 14px; color: #666;">' +
                'Thank you for your payment!<br>' +
                'A confirmation has been sent to your email.' +
                '</p>' +
                '</div>';
        }
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}