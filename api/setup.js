export default function handler(req, res) {
  const setupBuild = process.env.VERCEL_GIT_COMMIT_SHA
    ? `setup-${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`
    : "setup-local-debug-v1";

  const normalizeId = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed.includes("{{") || trimmed.includes("}}") || trimmed === "undefined" || trimmed === "null") {
      return null;
    }
    return trimmed;
  };

  const findFirstHeader = (...keys) => {
    for (const key of keys) {
      const value = req.headers?.[key];
      const normalized = normalizeId(Array.isArray(value) ? value[0] : value);
      if (normalized) return normalized;
    }
    return null;
  };

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

  const queryLocationId = normalizeId(req.query.locationId || req.query.location_id || req.query.subAccountId || req.query.location);
  const headerLocationId = findFirstHeader(
    "x-ghl-location-id",
    "x-location-id",
    "x-lc-location-id",
    "x-sub-account-id",
    "locationid"
  );
  const defaultLocationId = queryLocationId || headerLocationId || normalizeId(process.env.GHL_DEFAULT_LOCATION_ID) || "cv3mmKLIVdqbZSVeksCW";
  const initialError = req.query.error || "";

  res.setHeader("X-Clover-Setup-Build", setupBuild);

  // Canary endpoint: verifies which deployment is serving /setup
  if (req.query.ping === "1") {
    return res.status(200).json({
      ok: true,
      setupBuild,
      host: req.headers?.host || null,
      queryLocationId,
      headerLocationId,
      defaultLocationId,
      hasDefaultLocationEnv: !!normalizeId(process.env.GHL_DEFAULT_LOCATION_ID),
      now: new Date().toISOString(),
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

        .message.info {
            background: #e7f1ff;
            color: #084298;
            border: 1px solid #b6d4fe;
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
        <p id="buildInfo" class="help-text" style="text-align:center; display:none; margin-bottom: 16px;"></p>
        
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
        const defaultLocationId = '${defaultLocationId}';
        const setupBuild = '${setupBuild}';
        const initialLocationId = '${defaultLocationId}';
        const installError = '${String(initialError).replace(/'/g, "\\'")}';

        function isPlaceholderValue(value) {
            if (!value || typeof value !== 'string') return false;
            return value.includes('{{') || value.includes('}}') || value === 'undefined' || value === 'null';
        }

        function cleanId(value) {
            if (!value) return null;
            const trimmed = String(value).trim();
            if (!trimmed || isPlaceholderValue(trimmed)) return null;
            return trimmed;
        }

        function parseFromSearch(search) {
            const params = new URLSearchParams(search || '');
            return {
                locationId: cleanId(
                    params.get('locationId') ||
                    params.get('location_id') ||
                    params.get('location') ||
                    params.get('subAccountId') ||
                    params.get('sub_account_id') ||
                    params.get('id')
                ),
                companyId: cleanId(params.get('companyId') || params.get('company_id') || params.get('company'))
            };
        }

        function parseFromHash(hash) {
            if (!hash) return {};
            const hashValue = hash.startsWith('#') ? hash.slice(1) : hash;
            return parseFromSearch(hashValue);
        }

        function parseFromUrl(url) {
            try {
                const parsed = new URL(url);
                const searchValues = parseFromSearch(parsed.search);
                const hashValues = parseFromHash(parsed.hash);

                if (!searchValues.locationId || !searchValues.companyId) {
                    const locationPathMatch = parsed.pathname.match(/\\/location\\/([a-zA-Z0-9_-]+)/i);
                    if (locationPathMatch && !searchValues.locationId) {
                        searchValues.locationId = locationPathMatch[1];
                    }
                }

                return {
                    locationId: searchValues.locationId || hashValues.locationId,
                    companyId: searchValues.companyId || hashValues.companyId
                };
            } catch (error) {
                return {};
            }
        }

        function resolveContext() {
            const context = {
                locationId: null,
                companyId: null,
                source: 'none'
            };

            const currentUrlData = parseFromUrl(window.location.href);
            if (currentUrlData.locationId || currentUrlData.companyId) {
                context.locationId = currentUrlData.locationId || context.locationId;
                context.companyId = currentUrlData.companyId || context.companyId;
                context.source = 'window.location';
            }

            if ((!context.locationId || !context.companyId) && document.referrer) {
                const referrerData = parseFromUrl(document.referrer);
                context.locationId = context.locationId || referrerData.locationId;
                context.companyId = context.companyId || referrerData.companyId;
                if (referrerData.locationId || referrerData.companyId) {
                    context.source = 'document.referrer';
                }
            }

            if ((!context.locationId || !context.companyId) && window.parent && window.parent !== window) {
                try {
                    const parentData = parseFromUrl(window.parent.location.href);
                    context.locationId = context.locationId || parentData.locationId;
                    context.companyId = context.companyId || parentData.companyId;
                    if (parentData.locationId || parentData.companyId) {
                        context.source = 'parent.location';
                    }
                } catch (error) {
                    console.log('Cannot access parent location (cross-origin):', error.message);
                }
            }

            if (!context.locationId && cleanId(defaultLocationId)) {
                context.locationId = cleanId(defaultLocationId);
                context.source = 'default-fallback';
            }

            return context;
        }

        const resolvedContext = resolveContext();
        let locationId = resolvedContext.locationId || cleanId(initialLocationId);
        let companyId = resolvedContext.companyId;

        console.log('Setup context resolved:', {
            locationId,
            companyId,
            source: resolvedContext.source
        });

        let currentMode = 'test';

        window.addEventListener('message', function(event) {
            const data = event && event.data ? event.data : {};
            const messageLocationId = cleanId(data.locationId || data.location_id || data.subAccountId);
            const messageCompanyId = cleanId(data.companyId || data.company_id);

            if (messageLocationId && !locationId) {
                locationId = messageLocationId;
                showMessage('info', 'Detected location from embedded app context. You can continue setup.');
            }

            if (messageCompanyId && !companyId) {
                companyId = messageCompanyId;
            }
        });

        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'REQUEST_GHL_CONTEXT' }, '*');
        }
        
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
                locationId = cleanId(defaultLocationId);
            }

            if (!locationId) {
                showMessage('error', 'Missing location ID. Please open from GHL App Marketplace install flow or add ?locationId=YOUR_ID to URL.');
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
                    if (result.warning) {
                        showMessage('info', result.warning);
                    } else {
                        showMessage('success', result.message || '✓ Configuration saved successfully!');
                    }
                    
                    // Clear sensitive fields
                    document.getElementById('apiToken').value = '';

                    if (result.providerConfigured !== false) {
                        setTimeout(() => {
                            if (window.parent && window.parent !== window) {
                                window.parent.postMessage({ type: 'SETUP_COMPLETE' }, '*');
                            }
                        }, 2000);
                    }
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
            messageDiv.className = "message " + type;
            messageDiv.textContent = text;
            messageDiv.style.display = 'block';
            
            if (type === 'success' || type === 'info') {
                setTimeout(() => messageDiv.style.display = 'none', 5000);
            }
        }

        function safeDecodeURIComponent(value) {
            try {
                return decodeURIComponent(value);
            } catch (error) {
                console.warn('Could not decode installError, showing raw value instead:', error.message);
                return value;
            }
        }
        
        if (installError) {
            showMessage('error', 'OAuth/install warning: ' + safeDecodeURIComponent(installError));
        }

        const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
        if (debugEnabled) {
            const buildInfo = document.getElementById('buildInfo');
            buildInfo.textContent = 'Build: ' + setupBuild;
            buildInfo.style.display = 'block';
        }

        if (!locationId) {
            showMessage('error', 'No location ID found in URL/context. Trying embedded context. If this persists, set GHL_DEFAULT_LOCATION_ID in Vercel.');
        } else if (!resolvedContext.locationId || resolvedContext.source === 'default-fallback') {
            showMessage('info', 'Using configured default location for setup: ' + locationId);
        }
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
