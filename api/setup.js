export default function handler(req, res) {
  // Clover connection test
  if (req.query.test === "clover") {
    const merchantId = process.env.CLOVER_MERCHANT_ID;
    const apiToken = process.env.CLOVER_API_TOKEN;
    const environment = process.env.CLOVER_ENVIRONMENT;

    return res.status(200).json({
      connected: !!(merchantId && apiToken && environment),
      merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : "NOT SET",
      hasApiToken: !!apiToken,
      environment: environment || "NOT SET",
    });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clover Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
        }
        
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
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
        
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .mode-toggle {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .mode-btn {
            flex: 1;
            padding: 12px;
            border: 2px solid #e0e0e0;
            background: white;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s;
        }
        
        .mode-btn.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        
        .btn:hover { transform: translateY(-2px); }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        
        .message {
            padding: 12px;
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
        
        .help-text {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
        
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>Clover Setup</h1>
        <p class="subtitle">Connect your Clover payment processor</p>
        
        <form id="setupForm">
            <div class="mode-toggle">
                <button type="button" class="mode-btn active" data-mode="test">Test Mode</button>
                <button type="button" class="mode-btn" data-mode="live">Live Mode</button>
            </div>
            
            <div class="form-group">
                <label for="merchantId">Clover Merchant ID *</label>
                <input type="text" id="merchantId" required placeholder="Enter Merchant ID">
                <div class="help-text">Find in Clover Dashboard</div>
            </div>
            
            <div class="form-group">
                <label for="apiToken">Clover API Token *</label>
                <input type="password" id="apiToken" required placeholder="Enter API Token">
                <div class="help-text">Generate in Clover Dashboard → API Tokens</div>
            </div>
            
            <div class="form-group">
                <label for="publicKey">Clover Public Key (Optional)</label>
                <input type="text" id="publicKey" placeholder="For frontend payments">
            </div>
            
            <button type="submit" class="btn" id="submitBtn">Save Configuration</button>
            
            <div id="message" class="message"></div>
        </form>
    </div>
    
    <script>
        // Simple locationId extraction
        const urlParams = new URLSearchParams(window.location.search);
        let locationId = urlParams.get('locationId') || urlParams.get('location_id');
        const companyId = urlParams.get('companyId') || urlParams.get('company_id');
        
        // If not in URL, try to get from parent (for iframe)
        if (!locationId && window.location !== window.parent.location) {
            try {
                const parentUrl = window.parent.location.href;
                const match = parentUrl.match(/\\/location\\/([a-zA-Z0-9_-]+)/);
                if (match) locationId = match[1];
            } catch (e) {
                console.log('Cannot access parent URL');
            }
        }
        
        console.log('Setup loaded - LocationId:', locationId);
        
        let currentMode = 'test';
        
        // Mode toggle
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentMode = this.dataset.mode;
            });
        });
        
        // Form submit
        document.getElementById('setupForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!locationId) {
                showMessage('error', 'Missing location ID. Please access from GHL or add ?locationId=YOUR_ID to URL');
                return;
            }
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Saving...';
            
            const config = {
                locationId: locationId,
                companyId: companyId,
                merchantId: document.getElementById('merchantId').value,
                apiToken: document.getElementById('apiToken').value,
                publicKey: document.getElementById('publicKey').value,
                liveMode: currentMode === 'live'
            };
            
            try {
                const response = await fetch('/api/config/save-clover-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    showMessage('success', result.message || '✓ Configuration saved successfully!');
                    
                    // Clear sensitive fields
                    document.getElementById('apiToken').value = '';
                    
                    setTimeout(() => {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'SETUP_COMPLETE' }, '*');
                        }
                    }, 2000);
                } else {
                    showMessage('error', result.error || 'Failed to save configuration');
                }
            } catch (error) {
                console.error('Setup error:', error);
                showMessage('error', 'Network error: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Save Configuration';
            }
        });
        
        function showMessage(type, text) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = \`message \${type}\`;
            messageDiv.textContent = text;
            messageDiv.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => messageDiv.style.display = 'none', 5000);
            }
        }
        
        // Show warning if no locationId
        if (!locationId) {
            showMessage('error', 'No location ID found. Access this page from GHL integration settings.');
        }
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}