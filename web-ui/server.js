import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// GitHub OAuth2 configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
  console.warn('⚠️  GitHub OAuth2 credentials not configured.');
  console.warn('   The web UI will guide you through setting up a GitHub OAuth app.');
  console.warn('   Visit http://localhost:3000 to get started.');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Store for temporary session data (in production, use Redis or database)
const sessions = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start OAuth2 flow
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

// OAuth2 callback
app.get('/auth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }
  
  if (!code || !state) {
    return res.redirect('/?error=missing_code_or_state');
  }
  
  // Validate state
  const sessionData = sessions.get(state);
  if (!sessionData) {
    return res.redirect('/?error=invalid_state');
  }
  
  // Clean up session
  sessions.delete(state);
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code,
      state: state,
    }, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    const { access_token, token_type, scope } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('No access token received');
    }
    
    // Get user information
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github+json',
      }
    });
    
    const user = userResponse.data;
    
    // Redirect to success page with user info
    const params = new URLSearchParams({
      success: 'true',
      access_token: access_token,
      user: JSON.stringify({
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        email: user.email,
      }),
      scope: scope || sessionData.scopes,
    });
    
    res.redirect(`/?${params.toString()}`);
    
  } catch (error) {
    console.error('OAuth2 exchange error:', error.response?.data || error.message);
    res.redirect(`/?error=${encodeURIComponent('oauth_exchange_failed')}`);
  }
});

// API endpoint to get current authentication status
app.get('/api/auth/status', (req, res) => {
  const { access_token } = req.query;
  
  if (!access_token) {
    return res.json({ authenticated: false });
  }
  
  // Verify token with GitHub API
  axios.get('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/vnd.github+json',
    }
  }).then(response => {
    res.json({
      authenticated: true,
      user: response.data,
    });
  }).catch(error => {
    res.json({
      authenticated: false,
      error: 'Invalid token',
    });
  });
});

// API endpoint to test GitHub API calls
app.post('/api/github/:endpoint', async (req, res) => {
  const { access_token } = req.body;
  const endpoint = req.params.endpoint;
  
  if (!access_token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const response = await axios.get(`https://api.github.com/${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Accept': 'application/vnd.github+json',
      }
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || error.message,
    });
  }
});

// MCP HTTP Protocol Implementation
// Authentication middleware for MCP endpoints
const authenticateMCP = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  req.token = token;
  next();
};

// MCP Tools List - Returns available GitHub tools
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
    },
    {
      name: "get_repository",
      description: "Get detailed information about a specific repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "list_issues",
      description: "List issues for a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
          per_page: { type: "number", minimum: 1, maximum: 100, default: 30 }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "create_issue",
      description: "Create a new issue in a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          title: { type: "string", description: "Issue title" },
          body: { type: "string", description: "Issue body/description" },
          labels: { type: "array", items: { type: "string" }, description: "Issue labels" }
        },
        required: ["owner", "repo", "title"]
      }
    },
    {
      name: "list_pull_requests",
      description: "List pull requests for a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
          per_page: { type: "number", minimum: 1, maximum: 100, default: 30 }
        },
        required: ["owner", "repo"]
      }
    },
    {
      name: "get_file_contents",
      description: "Get the contents of a file from a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path" },
          ref: { type: "string", description: "Branch, tag, or commit SHA" }
        },
        required: ["owner", "repo", "path"]
      }
    },
    {
      name: "list_commits",
      description: "List commits for a repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          sha: { type: "string", description: "Branch or commit SHA" },
          per_page: { type: "number", minimum: 1, maximum: 100, default: 30 }
        },
        required: ["owner", "repo"]
      }
    }
  ];
  
  res.json({ tools });
});

// MCP Tool Call - Execute a specific tool
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
        
      case 'get_repository':
        if (!args?.owner || !args?.repo) {
          return res.status(400).json({ error: 'owner and repo are required' });
        }
        result = await callGitHubAPI(req.token, `repos/${args.owner}/${args.repo}`);
        break;
        
      case 'list_issues':
        if (!args?.owner || !args?.repo) {
          return res.status(400).json({ error: 'owner and repo are required' });
        }
        const issueParams = new URLSearchParams();
        if (args?.state) issueParams.append('state', args.state);
        if (args?.per_page) issueParams.append('per_page', args.per_page);
        result = await callGitHubAPI(req.token, `repos/${args.owner}/${args.repo}/issues?${issueParams}`);
        break;
        
      case 'create_issue':
        if (!args?.owner || !args?.repo || !args?.title) {
          return res.status(400).json({ error: 'owner, repo, and title are required' });
        }
        result = await callGitHubAPI(req.token, `repos/${args.owner}/${args.repo}/issues`, 'POST', {
          title: args.title,
          body: args.body || '',
          labels: args.labels || []
        });
        break;
        
      case 'list_pull_requests':
        if (!args?.owner || !args?.repo) {
          return res.status(400).json({ error: 'owner and repo are required' });
        }
        const prParams = new URLSearchParams();
        if (args?.state) prParams.append('state', args.state);
        if (args?.per_page) prParams.append('per_page', args.per_page);
        result = await callGitHubAPI(req.token, `repos/${args.owner}/${args.repo}/pulls?${prParams}`);
        break;
        
      case 'get_file_contents':
        if (!args?.owner || !args?.repo || !args?.path) {
          return res.status(400).json({ error: 'owner, repo, and path are required' });
        }
        const fileParams = new URLSearchParams();
        if (args?.ref) fileParams.append('ref', args.ref);
        result = await callGitHubAPI(req.token, `repos/${args.owner}/${args.repo}/contents/${args.path}?${fileParams}`);
        break;
        
      case 'list_commits':
        if (!args?.owner || !args?.repo) {
          return res.status(400).json({ error: 'owner and repo are required' });
        }
        const commitParams = new URLSearchParams();
        if (args?.sha) commitParams.append('sha', args.sha);
        if (args?.per_page) commitParams.append('per_page', args.per_page);
        result = await callGitHubAPI(req.token, `repos/${args.owner}/${args.repo}/commits?${commitParams}`);
        break;
        
      default:
        return res.status(400).json({ error: `Unknown tool: ${name}` });
    }
    
    res.json({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    
  } catch (error) {
    console.error('Tool execution error:', error);
    res.status(500).json({ 
      error: 'Tool execution failed',
      details: error.message 
    });
  }
});

// Helper function to call GitHub API
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    github_client_id: GITHUB_CLIENT_ID ? 'configured' : 'missing',
  });
});

// Clean up old sessions (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [state, session] of sessions.entries()) {
    if (now - session.timestamp > 10 * 60 * 1000) { // 10 minutes
      sessions.delete(state);
    }
  }
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`GitHub OAuth2 Web UI server running on http://localhost:${PORT}`);
  console.log(`GitHub Client ID: ${GITHUB_CLIENT_ID ? 'configured' : 'NOT CONFIGURED'}`);
  console.log(`Redirect URI: ${REDIRECT_URI}`);
});
