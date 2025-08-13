# OAuth2 Authentication in MCP: Technical Implementation Guide

## Overview

This document explains how OAuth2 authentication is integrated into the Model Context Protocol (MCP) server to provide secure, user-scoped access to GitHub APIs. The implementation ensures that all MCP tool calls are executed within the context of the authenticated user's permissions.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [OAuth2 Flow Implementation](#oauth2-flow-implementation)
3. [MCP HTTP Protocol Integration](#mcp-http-protocol-integration)
4. [Security Considerations](#security-considerations)
5. [Code Examples](#code-examples)
6. [Configuration Guide](#configuration-guide)

## Architecture Overview

### Traditional MCP vs OAuth2-Enhanced MCP

```
Traditional MCP:
Client → MCP Server → API (with static credentials)

OAuth2-Enhanced MCP:
Client → Web UI → OAuth2 Flow → MCP Server → API (with user token)
```

### Component Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Client    │    │    Web UI        │    │  OAuth2 Server  │
│                 │    │                  │    │   (GitHub)      │
│ - Tool calls    │    │ - Authentication │    │ - Token issuing │
│ - HTTP requests │    │ - Token storage  │    │ - User consent  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌──────────────────┐
                    │   MCP Server     │
                    │                  │
                    │ - Token validation│
                    │ - API calls      │
                    │ - Tool execution │
                    └──────────────────┘
```

## OAuth2 Flow Implementation

### 1. Initial Authentication Flow

```javascript
// Step 1: Redirect to GitHub OAuth2
app.get('/auth/github', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const scopes = req.query.scopes || 'repo,user';
  
  // Store state for validation
  sessions.set(state, { timestamp: Date.now(), scopes });
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${GITHUB_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${state}`;
  
  res.redirect(githubAuthUrl);
});
```

### 2. OAuth2 Callback Handling

```javascript
// Step 2: Handle OAuth2 callback
app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  // Validate state parameter (CSRF protection)
  const sessionData = sessions.get(state);
  if (!sessionData) {
    return res.redirect('/?error=invalid_state');
  }
  
  try {
    // Exchange authorization code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      state: state,
    }, {
      headers: { 'Accept': 'application/json' }
    });
    
    const { access_token } = tokenResponse.data;
    
    // Get user information
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github+json',
      }
    });
    
    // Redirect with token and user info
    res.redirect(`/?success=true&access_token=${access_token}&user=${JSON.stringify(userResponse.data)}`);
    
  } catch (error) {
    res.redirect('/?error=oauth_exchange_failed');
  }
});
```

### 3. Token Storage and Management

```javascript
// Client-side token management
class GitHubOAuthApp {
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
  
  loadStoredAuth() {
    const storedToken = localStorage.getItem('github_access_token');
    const storedUser = localStorage.getItem('github_user');
    
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        this.handleAuthSuccess(storedToken, user);
      } catch (error) {
        this.clearStoredAuth();
      }
    }
  }
}
```

## MCP HTTP Protocol Integration

### 1. Authentication Middleware

```javascript
// Middleware to validate OAuth2 tokens for MCP endpoints
const authenticateMCP = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  req.token = token;
  next();
};
```

### 2. MCP Tools List Endpoint

```javascript
// Returns available GitHub tools with proper authentication
app.post('/mcp/tools/list', authenticateMCP, (req, res) => {
  const tools = [
    {
      name: "get_user",
      description: "Get the authenticated user's GitHub profile information",
      inputSchema: {
        type: "object",
        properties: {},
        required: []
      }
    },
    {
      name: "list_repositories",
      description: "List repositories for the authenticated user",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["all", "owner", "member"], default: "owner" },
          sort: { type: "string", enum: ["created", "updated", "pushed", "full_name"], default: "updated" },
          per_page: { type: "number", minimum: 1, maximum: 100, default: 30 }
        },
        required: []
      }
    }
    // ... more tools
  ];
  
  res.json({ tools });
});
```

### 3. MCP Tool Execution Endpoint

```javascript
// Execute tools with user-scoped authentication
app.post('/mcp/tools/call', authenticateMCP, async (req, res) => {
  const { name, arguments: args } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Tool name is required' });
  }
  
  try {
    let result;
    
    switch (name) {
      case 'get_user':
        result = await callGitHubAPI(req.token, 'user');
        break;
        
      case 'list_repositories':
        const repoParams = new URLSearchParams();
        if (args?.type) repoParams.append('type', args.type);
        if (args?.sort) repoParams.append('sort', args.sort);
        if (args?.per_page) repoParams.append('per_page', args.per_page);
        result = await callGitHubAPI(req.token, `user/repos?${repoParams}`);
        break;
        
      // ... handle other tools
        
      default:
        return res.status(400).json({ error: `Unknown tool: ${name}` });
    }
    
    res.json({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Tool execution failed',
      details: error.message 
    });
  }
});
```

### 4. GitHub API Helper Function

```javascript
// Helper function to make authenticated GitHub API calls
async function callGitHubAPI(token, endpoint, method = 'GET', data = null) {
  const config = {
    method,
    url: `https://api.github.com/${endpoint}`,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'GitHub-MCP-Server'
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.data = data;
  }
  
  const response = await axios(config);
  return response.data;
}
```

## Security Considerations

### 1. State Parameter Validation

```javascript
// CSRF protection using state parameter
const validateState = (req, res, next) => {
  const { state } = req.query;
  const sessionData = sessions.get(state);
  
  if (!sessionData || Date.now() - sessionData.timestamp > 10 * 60 * 1000) {
    return res.status(400).json({ error: 'Invalid or expired state' });
  }
  
  next();
};
```

### 2. Token Scope Validation

```javascript
// Ensure tokens have required scopes
const validateScopes = (requiredScopes) => {
  return async (req, res, next) => {
    const token = req.token;
    
    try {
      // Check token scopes with GitHub API
      const response = await axios.get('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const scopes = response.headers['x-oauth-scopes'] || '';
      const hasRequiredScopes = requiredScopes.every(scope => 
        scopes.includes(scope)
      );
      
      if (!hasRequiredScopes) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: requiredScopes,
          available: scopes.split(',').map(s => s.trim())
        });
      }
      
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
};
```

### 3. Rate Limiting

```javascript
// Implement rate limiting per user
const rateLimit = require('express-rate-limit');

const createRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each user to 100 requests per windowMs
  keyGenerator: (req) => req.token, // Rate limit by token
  message: {
    error: 'Too many requests',
    retryAfter: '15 minutes'
  }
});

app.use('/mcp/', createRateLimiter);
```

## Code Examples

### 1. MCP Client Configuration

```json
{
  "mcpServers": {
    "github-mcp-http": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "env": {
        "FETCH_BASE_URL": "https://your-domain.com/mcp",
        "FETCH_DEFAULT_HEADERS": "{\"Authorization\":\"Bearer YOUR_GITHUB_TOKEN\",\"Content-Type\":\"application/json\"}"
      }
    }
  }
}
```

### 2. Direct HTTP Tool Call

```bash
# List available tools
curl -X POST https://your-domain.com/mcp/tools/list \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  -H "Content-Type: application/json"

# Execute a tool
curl -X POST https://your-domain.com/mcp/tools/call \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_user",
    "arguments": {}
  }'
```

### 3. Frontend Integration

```javascript
// Test MCP tool from frontend
async function testMCPTool(toolName, args) {
  const token = localStorage.getItem('github_access_token');
  
  const response = await fetch('/mcp/tools/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: toolName,
      arguments: args
    })
  });
  
  const result = await response.json();
  return result;
}
```

## Configuration Guide

### 1. Environment Variables

```bash
# GitHub OAuth2 Application
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Server Configuration
PORT=3000
REDIRECT_URI=https://your-domain.com/auth/callback
NODE_ENV=production
```

### 2. GitHub OAuth App Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Configure:
   - **Application name**: Your MCP Server Name
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/auth/callback`
4. Copy Client ID and Client Secret to environment variables

### 3. Scope Recommendations

```javascript
// Recommended scopes for different use cases
const SCOPES = {
  basic: ['user', 'public_repo'],
  advanced: ['user', 'repo', 'admin:org'],
  full: ['user', 'repo', 'admin:org', 'gist', 'notifications', 'admin:repo_hook']
};
```

## Best Practices

### 1. Token Lifecycle Management

- Implement token refresh if using refresh tokens
- Store tokens securely (consider encryption for server-side storage)
- Implement token revocation endpoints
- Monitor token usage and expiration

### 2. Error Handling

```javascript
// Comprehensive error handling
const handleAPIError = (error, req, res, next) => {
  if (error.response?.status === 401) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Token expired or invalid',
      action: 'Please re-authenticate'
    });
  }
  
  if (error.response?.status === 403) {
    return res.status(403).json({
      error: 'Permission denied',
      message: 'Insufficient permissions for this operation',
      required_scopes: error.config?.requiredScopes
    });
  }
  
  // Handle rate limiting
  if (error.response?.status === 429) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      reset_time: error.response.headers['x-ratelimit-reset']
    });
  }
  
  next(error);
};
```

### 3. Logging and Monitoring

```javascript
// Log authentication events
const logAuthEvent = (event, details) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    user: details.user?.login,
    ip: details.ip,
    userAgent: details.userAgent
  }));
};

// Usage
app.get('/auth/callback', (req, res) => {
  logAuthEvent('oauth_callback', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    state: req.query.state
  });
  // ... handle callback
});
```

## Conclusion

This OAuth2 integration provides a secure, scalable way to add user authentication to MCP servers. Key benefits include:

- **User-scoped permissions**: Each tool call respects the authenticated user's GitHub permissions
- **No credential storage**: No need to store or manage API keys server-side
- **Secure token handling**: Industry-standard OAuth2 flow with CSRF protection
- **Scalable architecture**: Multiple users can authenticate independently
- **Audit trail**: All actions are tied to specific user accounts

The implementation maintains the simplicity of the MCP protocol while adding enterprise-grade security and user management capabilities.
