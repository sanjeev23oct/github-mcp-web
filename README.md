# GitHub MCP Server with OAuth2 Authentication

A comprehensive Model Context Protocol (MCP) server for GitHub integration with OAuth2 authentication and a web-based user interface.

## Overview

This project provides:
- **MCP Server**: Full-featured GitHub API integration with 20+ tools
- **OAuth2 Authentication**: Secure GitHub OAuth2 flow (no password handling)
- **Web UI**: Beautiful interface for authentication and API testing
- **Comprehensive GitHub Tools**: Repository, issue, PR, file, and workflow management

## Features

### 🔐 Secure OAuth2 Authentication
- Official GitHub OAuth2 implementation
- No password storage or handling
- Secure token-based API access
- Configurable scopes and permissions

### 🛠️ GitHub API Tools (20+ Tools)
- **Repository Management**: Create, list, get details, manage branches
- **Issue Management**: Create, list, update, assign, label issues
- **Pull Request Management**: Create, list, review, merge PRs
- **File Operations**: Read, create, browse files and directories
- **GitHub Actions**: List workflows, view runs, monitor builds
- **User & Organization**: Profile info, followers, team management
- **Commit Operations**: View history, branch management

### 🌐 Web User Interface
- Clean, modern interface
- Real-time OAuth2 flow
- API testing capabilities
- MCP configuration generator
- Token management

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web UI        │    │   Express Server │    │  GitHub OAuth2  │
│   (Frontend)    │◄──►│   (Backend)      │◄──►│   & API         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌──────────────────┐
│   Local Storage │    │   MCP Server     │
│   (Tokens)      │    │   (GitHub Tools) │
└─────────────────┘    └──────────────────┘
```

## Quick Start

### 1. Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **GitHub Account**

### 2. GitHub OAuth App Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: GitHub MCP Server
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/auth/callback`
4. Save and copy the **Client ID** and **Client Secret**

### 3. Install Dependencies

```bash
# Install MCP Server dependencies
cd github-oauth-server
npm install
npm run build

# Install Web UI dependencies
cd ../web-ui
npm install
```

### 4. Configure Environment

```bash
# Copy environment template
cd web-ui
cp .env.example .env

# Edit .env file with your GitHub OAuth credentials
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
```

### 5. Run the Application

```bash
# Start the web UI server
cd web-ui
npm start

# Server will be available at http://localhost:3000
```

### 6. Authenticate with GitHub

1. Open `http://localhost:3000` in your browser
2. Select desired OAuth2 scopes
3. Click "Connect to GitHub"
4. Authorize the application
5. Copy the generated MCP configuration

### 7. Configure MCP Client

Add the generated configuration to your MCP settings file:

**For Cline (VSCode)**: `C:\Users\[USERNAME]\AppData\Roaming\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

**For Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "github-oauth": {
      "command": "node",
      "args": ["d:/repos-personal/repos/mcp-github-web/github-oauth-server/build/index.js"],
      "env": {
        "GITHUB_CLIENT_ID": "your_client_id",
        "GITHUB_CLIENT_SECRET": "your_client_secret",
        "GITHUB_ACCESS_TOKEN": "your_access_token_from_auth"
      }
    }
  }
}
```

## Available GitHub Tools

### Authentication & User Management
- `github_get_oauth_url` - Generate OAuth2 authorization URL
- `github_exchange_code` - Exchange code for access token
- `github_get_user` - Get user information

### Repository Management
- `github_list_repos` - List repositories
- `github_get_repo` - Get repository details
- `github_create_repo` - Create new repository
- `github_list_branches` - List repository branches
- `github_get_commits` - Get commit history

### Issue Management
- `github_list_issues` - List repository issues
- `github_get_issue` - Get issue details
- `github_create_issue` - Create new issue
- `github_update_issue` - Update existing issue

### Pull Request Management
- `github_list_pulls` - List pull requests
- `github_get_pull` - Get PR details
- `github_create_pull` - Create new pull request

### File & Content Operations
- `github_get_content` - Get file/directory contents
- `github_create_file` - Create new file

### GitHub Actions
- `github_list_workflows` - List workflows
- `github_list_workflow_runs` - List workflow runs

## OAuth2 Scopes

Configure these scopes based on your needs:

| Scope | Description |
|-------|-------------|
| `repo` | Full repository access |
| `user` | User profile information |
| `admin:org` | Organization administration |
| `gist` | Gist access |
| `notifications` | Notification access |
| `user:email` | Email address access |
| `public_repo` | Public repository access only |
| `write:packages` | Package registry write |
| `read:packages` | Package registry read |

## Security Features

### 🔒 OAuth2 Best Practices
- State parameter validation
- Secure token exchange
- No password handling
- Automatic token expiration handling

### 🛡️ Environment Security
- Environment variable configuration
- No hardcoded credentials
- Secure session management
- CORS protection

### 🔐 Token Management
- Secure local storage
- Token validation
- Automatic cleanup
- Error handling

## API Testing

The web interface includes an API testing tool:

1. Enter GitHub API endpoint (e.g., `user/repos`)
2. Click "Test API Call"
3. View formatted JSON response
4. Check authentication and permissions

## Troubleshooting

### Common Issues

**"Missing environment variables"**
- Ensure `.env` file exists with `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

**"OAuth2 exchange failed"**
- Verify GitHub OAuth app callback URL matches exactly
- Check client ID and secret are correct

**"Access denied"**
- User declined authorization
- Check requested scopes are appropriate

**"MCP server not connecting"**
- Verify MCP configuration paths are correct
- Ensure server is built (`npm run build`)
- Check environment variables in MCP config

### Debug Mode

Enable debug logging:

```bash
DEBUG=github-mcp:* npm start
```

## Development

### Project Structure

```
├── github-oauth-server/     # MCP Server
│   ├── src/
│   │   └── index.ts        # Main server implementation
│   ├── build/              # Compiled JavaScript
│   └── package.json        # Server dependencies
├── web-ui/                 # Web Interface
│   ├── public/            # Static files
│   │   ├── index.html     # Main page
│   │   ├── styles.css     # Styling
│   │   └── app.js         # Frontend logic
│   ├── server.js          # Express server
│   └── package.json       # UI dependencies
└── README.md              # This file
```

### Building from Source

```bash
# Build MCP server
cd github-oauth-server
npm run build

# For development with auto-rebuild
npm run watch
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Links

- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review GitHub OAuth documentation
3. Open an issue with detailed description
4. Include error logs and configuration

---

**🚀 Enjoy seamless GitHub integration with secure OAuth2 authentication!**
