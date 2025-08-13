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
        const projectPath = window.location.origin.includes('localhost') 
            ? 'd:/repos-personal/repos/mcp-github-web/github-oauth-server'
            : '/path/to/github-oauth-server';
            
        const config = {
            "mcpServers": {
                "github-oauth": {
                    "command": "node",
                    "args": [`${projectPath}/build/index.js`],
                    "env": {
                        "GITHUB_CLIENT_ID": "your-github-client-id",
                        "GITHUB_CLIENT_SECRET": "your-github-client-secret",
                        "GITHUB_ACCESS_TOKEN": this.accessToken
                    }
                }
            }
        };

        document.getElementById('mcp-config').textContent = JSON.stringify(config, null, 2);
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
