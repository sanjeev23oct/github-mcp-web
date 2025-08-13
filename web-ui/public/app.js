// GitHub OAuth2 Web UI Application
class GitHubOAuthApp {
    constructor() {
        this.accessToken = null;
        this.user = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkURLParams();
        this.loadStoredAuth();
    }

    setupEventListeners() {
        // Connect button
        document.getElementById('connect-btn').addEventListener('click', () => {
            this.startOAuthFlow();
        });

        // Disconnect button
        document.getElementById('disconnect-btn').addEventListener('click', () => {
            this.disconnect();
        });

        // Copy token button
        document.getElementById('copy-token-btn').addEventListener('click', () => {
            this.copyToClipboard(this.accessToken, 'Access token copied to clipboard!');
        });

        // API test button
        document.getElementById('test-api-btn').addEventListener('click', () => {
            this.testAPI();
        });

        // Copy config button
        document.getElementById('copy-config-btn').addEventListener('click', () => {
            const config = document.getElementById('mcp-config').textContent;
            this.copyToClipboard(config, 'Configuration copied to clipboard!');
        });

        // API endpoint input - Enter key
        document.getElementById('api-endpoint').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.testAPI();
            }
        });
    }

    checkURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Check for OAuth2 success
        if (urlParams.get('success') === 'true') {
            const accessToken = urlParams.get('access_token');
            const userStr = urlParams.get('user');
            const scope = urlParams.get('scope');
            
            if (accessToken && userStr) {
                try {
                    const user = JSON.parse(userStr);
                    this.handleAuthSuccess(accessToken, user, scope);
                    // Clean URL
                    window.history.replaceState({}, document.title, '/');
                } catch (error) {
                    console.error('Error parsing user data:', error);
                    this.showError('Error processing authentication data');
                }
            }
        }

        // Check for OAuth2 error
        const error = urlParams.get('error');
        if (error) {
            this.showError(this.getErrorMessage(error));
            // Clean URL
            window.history.replaceState({}, document.title, '/');
        }
    }

    loadStoredAuth() {
        const storedToken = localStorage.getItem('github_access_token');
        const storedUser = localStorage.getItem('github_user');
        
        if (storedToken && storedUser) {
            try {
                const user = JSON.parse(storedUser);
                this.handleAuthSuccess(storedToken, user);
                // Load MCP tools if user is already authenticated
                setTimeout(() => window.loadMCPTools(), 1000);
            } catch (error) {
                console.error('Error loading stored auth:', error);
                this.clearStoredAuth();
            }
        }
    }

    async startOAuthFlow() {
        // Check if OAuth credentials are configured
        try {
            const healthResponse = await fetch('/health');
            const healthData = await healthResponse.json();
            
            if (healthData.github_client_id === 'missing') {
                this.showSetupInstructions();
                return;
            }
        } catch (error) {
            console.error('Health check failed:', error);
        }
        
        const scopesSelect = document.getElementById('scopes');
        const selectedScopes = Array.from(scopesSelect.selectedOptions).map(option => option.value);
        const scopes = selectedScopes.length > 0 ? selectedScopes.join(',') : 'repo,user';
        
        // Redirect to OAuth2 endpoint
        window.location.href = `/auth/github?scopes=${encodeURIComponent(scopes)}`;
    }

    showSetupInstructions() {
        const authCard = document.querySelector('.auth-card');
        authCard.innerHTML = `
            <h2>🚀 Setup Required</h2>
            <p>Before you can authenticate with GitHub, you need to create a GitHub OAuth App.</p>
            
            <div class="setup-steps">
                <h3>📝 Step-by-Step Setup:</h3>
                <ol>
                    <li>Go to <a href="https://github.com/settings/developers" target="_blank">GitHub Developer Settings</a></li>
                    <li>Click <strong>"New OAuth App"</strong></li>
                    <li>Fill in the details:
                        <ul>
                            <li><strong>Application name:</strong> GitHub MCP Server</li>
                            <li><strong>Homepage URL:</strong> <code>http://localhost:3000</code></li>
                            <li><strong>Authorization callback URL:</strong> <code>http://localhost:3000/auth/callback</code></li>
                        </ul>
                    </li>
                    <li>Save and copy the <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                    <li>Create a <code>.env</code> file in the <code>web-ui</code> directory:</li>
                </ol>
                
                <div class="code-example">
                    <pre>GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback</pre>
                    <button onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent)" class="copy-btn">Copy Template</button>
                </div>
                
                <p><strong>6.</strong> Restart the server: <code>npm start</code></p>
                <p><strong>7.</strong> Refresh this page and click "Connect to GitHub"</p>
            </div>
            
            <div class="setup-help">
                <h3>🔧 Alternative: Use Setup Script</h3>
                <p>Run the interactive setup script from the project root:</p>
                <div class="code-example">
                    <pre>node setup.js</pre>
                </div>
            </div>
            
            <button onclick="window.location.reload()" class="connect-btn">
                🔄 Refresh Page
            </button>
        `;
    }

    handleAuthSuccess(accessToken, user, scope) {
        this.accessToken = accessToken;
        this.user = user;
        
        // Store in localStorage for persistence
        localStorage.setItem('github_access_token', accessToken);
        localStorage.setItem('github_user', JSON.stringify(user));
        if (scope) {
            localStorage.setItem('github_scope', scope);
        }
        
        this.showDashboard();
        this.updateMCPConfig();
    }

    showDashboard() {
        // Hide auth section
        document.getElementById('auth-section').style.display = 'none';
        
        // Show dashboard section
        document.getElementById('dashboard-section').style.display = 'flex';
        
        // Update user info
        document.getElementById('user-avatar').src = this.user.avatar_url;
        document.getElementById('user-name').textContent = this.user.name || this.user.login;
        document.getElementById('user-login').textContent = `@${this.user.login}`;
        document.getElementById('user-email').textContent = this.user.email || 'Email not public';
    }

    showAuth() {
        // Show auth section
        document.getElementById('auth-section').style.display = 'flex';
        
        // Hide dashboard section
        document.getElementById('dashboard-section').style.display = 'none';
    }

    disconnect() {
        this.clearStoredAuth();
        this.accessToken = null;
        this.user = null;
        this.showAuth();
        this.hideError();
        
        // Clear API response
        const apiResponse = document.getElementById('api-response');
        apiResponse.style.display = 'none';
        apiResponse.innerHTML = '';
    }

    clearStoredAuth() {
        localStorage.removeItem('github_access_token');
        localStorage.removeItem('github_user');
        localStorage.removeItem('github_scope');
    }

    async testAPI() {
        const endpoint = document.getElementById('api-endpoint').value.trim();
        if (!endpoint) {
            this.showError('Please enter an API endpoint');
            return;
        }

        if (!this.accessToken) {
            this.showError('No access token available');
            return;
        }

        const testButton = document.getElementById('test-api-btn');
        const originalText = testButton.textContent;
        testButton.textContent = 'Testing...';
        testButton.disabled = true;

        try {
            const response = await fetch(`/api/github/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    access_token: this.accessToken
                })
            });

            const data = await response.json();
            
            const apiResponse = document.getElementById('api-response');
            apiResponse.style.display = 'block';
            
            if (response.ok) {
                apiResponse.innerHTML = `
                    <div class="success">✓ API call successful</div>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                `;
            } else {
                apiResponse.innerHTML = `
                    <div class="error-message">✗ API call failed: ${data.error}</div>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                `;
            }
        } catch (error) {
            const apiResponse = document.getElementById('api-response');
            apiResponse.style.display = 'block';
            apiResponse.innerHTML = `
                <div class="error-message">✗ Request failed: ${error.message}</div>
            `;
        } finally {
            testButton.textContent = originalText;
            testButton.disabled = false;
        }
    }

    updateMCPConfig() {
        const baseUrl = window.location.origin;
        
        const httpConfig = {
            "mcpServers": {
                "github-mcp-http": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-fetch"],
                    "env": {
                        "FETCH_BASE_URL": `${baseUrl}/mcp`,
                        "FETCH_DEFAULT_HEADERS": JSON.stringify({
                            "Authorization": `Bearer ${this.accessToken}`,
                            "Content-Type": "application/json"
                        })
                    }
                }
            }
        };

        const configText = `<!-- HTTP MCP Configuration -->
${JSON.stringify(httpConfig, null, 2)}

<!-- Available Endpoints -->
Tools List: POST ${baseUrl}/mcp/tools/list
Tool Call:  POST ${baseUrl}/mcp/tools/call

<!-- Example Tool Call -->
curl -X POST ${baseUrl}/mcp/tools/call \\
  -H "Authorization: Bearer ${this.accessToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "get_user",
    "arguments": {}
  }'`;

        document.getElementById('mcp-config').textContent = configText;
    }

    async copyToClipboard(text, successMessage = 'Copied to clipboard!') {
        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess(successMessage);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showSuccess(successMessage);
            } catch (fallbackError) {
                console.error('Fallback copy failed:', fallbackError);
                this.showError('Failed to copy to clipboard');
            }
            document.body.removeChild(textArea);
        }
    }

    showError(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.hideError();
        }, 10000);
    }

    hideError() {
        const errorElement = document.getElementById('error-message');
        errorElement.style.display = 'none';
    }

    showSuccess(message) {
        // Remove existing success messages
        const existingSuccess = document.querySelector('.success-message');
        if (existingSuccess) {
            existingSuccess.remove();
        }

        // Create success message
        const successElement = document.createElement('div');
        successElement.className = 'success success-message';
        successElement.textContent = message;
        
        // Insert after the user actions div
        const userActions = document.querySelector('.user-actions');
        if (userActions) {
            userActions.parentNode.insertBefore(successElement, userActions.nextSibling);
        }
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            successElement.remove();
        }, 3000);
    }

    getErrorMessage(error) {
        const errorMessages = {
            'access_denied': 'Access denied. You denied the authorization request.',
            'invalid_state': 'Invalid state parameter. Please try again.',
            'missing_code_or_state': 'Missing authorization code or state. Please try again.',
            'oauth_exchange_failed': 'Failed to exchange authorization code for access token. Please try again.',
        };
        
        return errorMessages[error] || `Authentication error: ${error}`;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GitHubOAuthApp();
});

// Additional utility functions
function formatJSON(obj) {
    return JSON.stringify(obj, null, 2);
}

function truncateString(str, maxLength = 50) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

// Handle page visibility changes (for token refresh if needed)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Page became visible, could check token validity here
        console.log('Page became visible');
    }
});

// Handle beforeunload to warn about losing auth state
window.addEventListener('beforeunload', (event) => {
    const token = localStorage.getItem('github_access_token');
    if (token && event.target.location.hostname !== 'localhost') {
        event.preventDefault();
        event.returnValue = 'You are currently authenticated with GitHub. Are you sure you want to leave?';
    }
});

// MCP Tool Testing functionality
window.testMCPTool = async function(toolName, inputSchema) {
    const app = window.githubApp;
    if (!app || !app.accessToken) {
        alert('Please authenticate first');
        return;
    }

    const args = {};
    const required = inputSchema.required || [];
    
    // Collect arguments based on schema
    for (const [prop, config] of Object.entries(inputSchema.properties || {})) {
        let value;
        if (config.type === 'string') {
            if (config.enum) {
                value = prompt(`${prop} (${config.enum.join(', ')}):`, config.default || '');
            } else {
                value = prompt(`${prop}:`, config.default || '');
            }
        } else if (config.type === 'number') {
            value = prompt(`${prop} (number):`, config.default || '');
            if (value) value = parseInt(value);
        } else if (config.type === 'array') {
            const input = prompt(`${prop} (comma-separated):`, '');
            value = input ? input.split(',').map(s => s.trim()) : [];
        } else {
            value = prompt(`${prop}:`, config.default || '');
        }
        
        if (value !== null && value !== '') {
            args[prop] = value;
        } else if (required.includes(prop)) {
            alert(`${prop} is required`);
            return;
        }
    }

    try {
        const response = await fetch('/mcp/tools/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${app.accessToken}`
            },
            body: JSON.stringify({
                name: toolName,
                arguments: args
            })
        });

        const result = await response.json();
        
        // Show result in a modal or new window
        const resultWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
        resultWindow.document.write(`
            <html>
                <head>
                    <title>MCP Tool Result: ${toolName}</title>
                    <style>
                        body { font-family: monospace; padding: 20px; }
                        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow: auto; }
                        .error { color: red; }
                        .success { color: green; }
                    </style>
                </head>
                <body>
                    <h2>Tool: ${toolName}</h2>
                    <h3>Arguments:</h3>
                    <pre>${JSON.stringify(args, null, 2)}</pre>
                    <h3>Result:</h3>
                    <pre class="${response.ok ? 'success' : 'error'}">${JSON.stringify(result, null, 2)}</pre>
                </body>
            </html>
        `);
    } catch (error) {
        alert(`Error testing tool: ${error.message}`);
    }
};

// Add MCP tools to dashboard when authenticated
window.loadMCPTools = async function() {
    const app = window.githubApp;
    if (!app || !app.accessToken) return;

    try {
        const response = await fetch('/mcp/tools/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${app.accessToken}`
            }
        });

        const data = await response.json();
        const toolsContainer = document.getElementById('mcp-tools-list');
        
        if (toolsContainer && data.tools) {
            toolsContainer.innerHTML = data.tools.map(tool => `
                <div class="tool-card">
                    <h4>${tool.name}</h4>
                    <p>${tool.description}</p>
                    <button onclick="testMCPTool('${tool.name}', ${JSON.stringify(tool.inputSchema).replace(/"/g, '&quot;')})" 
                            class="copy-btn">Test Tool</button>
                </div>
            `).join('');
            
            // Also populate the advanced tool selector
            if (window.populateToolSelector) {
                window.populateToolSelector(data.tools);
            }
        }
    } catch (error) {
        console.error('Error loading MCP tools:', error);
    }
};

// Enhanced Tool Testing Interface (Postman-style)
window.initAdvancedToolTesting = function() {
    const toolSelect = document.getElementById('tool-select');
    const toolParameters = document.getElementById('tool-parameters');
    const parameterInputs = document.getElementById('parameter-inputs');
    const executeBtn = document.getElementById('execute-tool-btn');
    const clearBtn = document.getElementById('clear-response-btn');
    const toolResponse = document.getElementById('tool-response');
    const responseContent = document.getElementById('response-content');
    
    let availableTools = [];
    let selectedTool = null;
    
    // Tool selection handler
    toolSelect.addEventListener('change', function() {
        const toolName = this.value;
        selectedTool = availableTools.find(tool => tool.name === toolName);
        
        if (selectedTool) {
            renderParameterInputs(selectedTool);
            toolParameters.style.display = 'block';
            executeBtn.disabled = false;
        } else {
            toolParameters.style.display = 'none';
            executeBtn.disabled = true;
        }
    });
    
    // Execute tool handler
    executeBtn.addEventListener('click', async function() {
        if (!selectedTool) return;
        
        const args = collectParameterValues();
        await executeSelectedTool(selectedTool.name, args);
    });
    
    // Clear response handler
    clearBtn.addEventListener('click', function() {
        toolResponse.style.display = 'none';
        responseContent.innerHTML = '';
    });
    
    function renderParameterInputs(tool) {
        const schema = tool.inputSchema;
        const properties = schema.properties || {};
        const required = schema.required || [];
        
        parameterInputs.innerHTML = '';
        
        Object.entries(properties).forEach(([paramName, paramConfig]) => {
            const paramDiv = document.createElement('div');
            paramDiv.className = 'parameter-input';
            
            const label = document.createElement('label');
            label.textContent = `${paramName}${required.includes(paramName) ? ' *' : ''}:`;
            label.setAttribute('for', `param-${paramName}`);
            
            let input;
            if (paramConfig.enum) {
                input = document.createElement('select');
                input.innerHTML = '<option value="">Select...</option>';
                paramConfig.enum.forEach(option => {
                    const optionEl = document.createElement('option');
                    optionEl.value = option;
                    optionEl.textContent = option;
                    input.appendChild(optionEl);
                });
            } else if (paramConfig.type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                if (paramConfig.minimum !== undefined) input.min = paramConfig.minimum;
                if (paramConfig.maximum !== undefined) input.max = paramConfig.maximum;
            } else if (paramConfig.type === 'boolean') {
                input = document.createElement('input');
                input.type = 'checkbox';
            } else {
                input = document.createElement('input');
                input.type = 'text';
            }
            
            input.id = `param-${paramName}`;
            input.name = paramName;
            if (paramConfig.default !== undefined) {
                if (input.type === 'checkbox') {
                    input.checked = paramConfig.default;
                } else {
                    input.value = paramConfig.default;
                }
            }
            
            const description = document.createElement('small');
            description.textContent = paramConfig.description || '';
            description.style.display = 'block';
            description.style.color = '#666';
            description.style.marginTop = '2px';
            
            paramDiv.appendChild(label);
            paramDiv.appendChild(input);
            if (paramConfig.description) paramDiv.appendChild(description);
            
            parameterInputs.appendChild(paramDiv);
        });
    }
    
    function collectParameterValues() {
        const args = {};
        const inputs = parameterInputs.querySelectorAll('input, select');
        
        inputs.forEach(input => {
            const paramName = input.name;
            let value;
            
            if (input.type === 'checkbox') {
                value = input.checked;
            } else if (input.type === 'number') {
                value = input.value ? parseFloat(input.value) : undefined;
            } else {
                value = input.value || undefined;
            }
            
            if (value !== undefined && value !== '') {
                args[paramName] = value;
            }
        });
        
        return args;
    }
    
    async function executeSelectedTool(toolName, args) {
        const app = window.githubApp;
        if (!app || !app.accessToken) {
            alert('Please authenticate first');
            return;
        }
        
        executeBtn.textContent = 'Executing...';
        executeBtn.disabled = true;
        
        try {
            const response = await fetch('/mcp/tools/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${app.accessToken}`
                },
                body: JSON.stringify({
                    name: toolName,
                    arguments: args
                })
            });
            
            const result = await response.json();
            
            // Show response
            toolResponse.style.display = 'block';
            responseContent.innerHTML = `
                <div class="response-meta">
                    <strong>Status:</strong> ${response.status} ${response.statusText}<br>
                    <strong>Tool:</strong> ${toolName}<br>
                    <strong>Arguments:</strong> ${JSON.stringify(args, null, 2)}<br>
                    <strong>Timestamp:</strong> ${new Date().toISOString()}
                </div>
                <pre class="${response.ok ? 'success' : 'error'}">${JSON.stringify(result, null, 2)}</pre>
            `;
            
        } catch (error) {
            toolResponse.style.display = 'block';
            responseContent.innerHTML = `
                <div class="error-message">✗ Request failed: ${error.message}</div>
            `;
        } finally {
            executeBtn.textContent = 'Execute Tool';
            executeBtn.disabled = false;
        }
    }
    
    // Public method to populate tools
    window.populateToolSelector = function(tools) {
        availableTools = tools;
        toolSelect.innerHTML = '<option value="">Choose a tool...</option>';
        
        tools.forEach(tool => {
            const option = document.createElement('option');
            option.value = tool.name;
            option.textContent = `${tool.name} - ${tool.description}`;
            toolSelect.appendChild(option);
        });
    };
};

// Store app instance globally for access from other functions
document.addEventListener('DOMContentLoaded', () => {
    window.githubApp = new GitHubOAuthApp();
    window.initAdvancedToolTesting();
    
    // Override handleAuthSuccess to load MCP tools
    const originalHandleAuthSuccess = window.githubApp.handleAuthSuccess;
    window.githubApp.handleAuthSuccess = function(accessToken, user, scope) {
        originalHandleAuthSuccess.call(this, accessToken, user, scope);
        setTimeout(() => window.loadMCPTools(), 1000);
    };
});
