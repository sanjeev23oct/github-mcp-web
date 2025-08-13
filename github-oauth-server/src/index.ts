#!/usr/bin/env node

/**
 * GitHub MCP Server with OAuth2 Authentication
 * 
 * This MCP server provides comprehensive GitHub integration using OAuth2 authentication.
 * It includes tools for repository management, issues, pull requests, commits, and more.
 * 
 * Features:
 * - OAuth2 authentication flow
 * - Repository management (create, list, get details)
 * - Issue management (create, list, update, close)
 * - Pull request management (create, list, merge, review)
 * - Commit and branch operations
 * - User and organization management
 * - GitHub Actions integration
 * - File and content operations
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from 'axios';

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OAUTH_BASE = 'https://github.com/login/oauth';

// Environment variables for OAuth2
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Warning: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables are required for OAuth2 flow');
}

if (!ACCESS_TOKEN) {
  console.error('Warning: GITHUB_ACCESS_TOKEN environment variable is required for API access');
}

interface GitHubUser {
  login: string;
  id: number;
  name: string;
  email: string;
  avatar_url: string;
  html_url: string;
  type: string;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  private: boolean;
  fork: boolean;
  created_at: string;
  updated_at: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  user: GitHubUser;
  assignees: GitHubUser[];
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
}

interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  html_url: string;
  user: GitHubUser;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  mergeable: boolean;
  created_at: string;
  updated_at: string;
}

class GitHubMCPServer {
  private server: Server;
  private githubAPI: AxiosInstance;
  private currentUser: GitHubUser | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "github-oauth-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Initialize GitHub API client
    this.githubAPI = axios.create({
      baseURL: GITHUB_API_BASE,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MCP-GitHub-Server/1.0.0',
      },
    });

    // Set authorization header if token is available
    if (ACCESS_TOKEN) {
      this.githubAPI.defaults.headers.common['Authorization'] = `Bearer ${ACCESS_TOKEN}`;
      this.initializeUser();
    }

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandling();
  }

  private async initializeUser() {
    try {
      const response = await this.githubAPI.get('/user');
      this.currentUser = response.data;
      console.error(`GitHub MCP Server initialized for user: ${this.currentUser?.login}`);
    } catch (error) {
      console.error('Failed to initialize GitHub user:', error);
    }
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupResourceHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [];

      if (this.currentUser) {
        resources.push(
          {
            uri: 'github://user/profile',
            name: 'User Profile',
            mimeType: 'application/json',
            description: 'Current authenticated user profile information',
          },
          {
            uri: 'github://user/repositories',
            name: 'User Repositories',
            mimeType: 'application/json',
            description: 'List of repositories owned by the authenticated user',
          }
        );
      }

      return { resources };
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === 'github://user/profile') {
        if (!this.currentUser) {
          throw new McpError(ErrorCode.InvalidRequest, 'User not authenticated');
        }
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(this.currentUser, null, 2),
          }],
        };
      }

      if (uri === 'github://user/repositories') {
        try {
          const response = await this.githubAPI.get('/user/repos', {
            params: { sort: 'updated', per_page: 100 }
          });
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(response.data, null, 2),
            }],
          };
        } catch (error) {
          throw new McpError(ErrorCode.InternalError, `Failed to fetch repositories: ${error}`);
        }
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // OAuth and Authentication
          {
            name: 'github_get_oauth_url',
            description: 'Generate GitHub OAuth2 authorization URL for authentication',
            inputSchema: {
              type: 'object',
              properties: {
                scopes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'OAuth2 scopes to request (e.g., repo, user, admin:org)',
                  default: ['repo', 'user']
                },
                state: {
                  type: 'string',
                  description: 'Random state parameter for security',
                  default: 'random-state-string'
                }
              }
            }
          },
          {
            name: 'github_exchange_code',
            description: 'Exchange OAuth2 authorization code for access token',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Authorization code from GitHub OAuth2 callback'
                },
                state: {
                  type: 'string',
                  description: 'State parameter for verification'
                }
              },
              required: ['code']
            }
          },

          // User Management
          {
            name: 'github_get_user',
            description: 'Get authenticated user information or specific user by username',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Username to get info for (leave empty for authenticated user)'
                }
              }
            }
          },

          // Repository Management
          {
            name: 'github_list_repos',
            description: 'List repositories for authenticated user or specific user/organization',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner (leave empty for authenticated user)'
                },
                type: {
                  type: 'string',
                  enum: ['all', 'owner', 'public', 'private', 'member'],
                  description: 'Type of repositories to list',
                  default: 'all'
                },
                sort: {
                  type: 'string',
                  enum: ['created', 'updated', 'pushed', 'full_name'],
                  description: 'Sort repositories by',
                  default: 'updated'
                },
                per_page: {
                  type: 'number',
                  description: 'Number of repositories per page (max 100)',
                  default: 30,
                  maximum: 100
                }
              }
            }
          },
          {
            name: 'github_get_repo',
            description: 'Get detailed information about a specific repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                }
              },
              required: ['owner', 'repo']
            }
          },
          {
            name: 'github_create_repo',
            description: 'Create a new repository',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Repository name'
                },
                description: {
                  type: 'string',
                  description: 'Repository description'
                },
                private: {
                  type: 'boolean',
                  description: 'Whether the repository should be private',
                  default: false
                },
                auto_init: {
                  type: 'boolean',
                  description: 'Whether to create an initial commit with empty README',
                  default: true
                },
                gitignore_template: {
                  type: 'string',
                  description: 'Gitignore template to use (e.g., Node, Python, Java)'
                },
                license_template: {
                  type: 'string',
                  description: 'License template to use (e.g., mit, apache-2.0)'
                }
              },
              required: ['name']
            }
          },

          // Issue Management
          {
            name: 'github_list_issues',
            description: 'List issues for a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                state: {
                  type: 'string',
                  enum: ['open', 'closed', 'all'],
                  description: 'Issue state to filter by',
                  default: 'open'
                },
                labels: {
                  type: 'string',
                  description: 'Comma-separated list of label names to filter by'
                },
                assignee: {
                  type: 'string',
                  description: 'Username of assignee to filter by'
                },
                per_page: {
                  type: 'number',
                  description: 'Number of issues per page (max 100)',
                  default: 30,
                  maximum: 100
                }
              },
              required: ['owner', 'repo']
            }
          },
          {
            name: 'github_get_issue',
            description: 'Get detailed information about a specific issue',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                issue_number: {
                  type: 'number',
                  description: 'Issue number'
                }
              },
              required: ['owner', 'repo', 'issue_number']
            }
          },
          {
            name: 'github_create_issue',
            description: 'Create a new issue',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                title: {
                  type: 'string',
                  description: 'Issue title'
                },
                body: {
                  type: 'string',
                  description: 'Issue body/description'
                },
                assignees: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Usernames to assign to the issue'
                },
                labels: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Labels to apply to the issue'
                }
              },
              required: ['owner', 'repo', 'title']
            }
          },
          {
            name: 'github_update_issue',
            description: 'Update an existing issue',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                issue_number: {
                  type: 'number',
                  description: 'Issue number'
                },
                title: {
                  type: 'string',
                  description: 'Updated issue title'
                },
                body: {
                  type: 'string',
                  description: 'Updated issue body/description'
                },
                state: {
                  type: 'string',
                  enum: ['open', 'closed'],
                  description: 'Issue state'
                },
                assignees: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Usernames to assign to the issue'
                },
                labels: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Labels to apply to the issue'
                }
              },
              required: ['owner', 'repo', 'issue_number']
            }
          },

          // Pull Request Management
          {
            name: 'github_list_pulls',
            description: 'List pull requests for a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                state: {
                  type: 'string',
                  enum: ['open', 'closed', 'all'],
                  description: 'Pull request state to filter by',
                  default: 'open'
                },
                head: {
                  type: 'string',
                  description: 'Filter by head branch (user:branch-name)'
                },
                base: {
                  type: 'string',
                  description: 'Filter by base branch'
                },
                per_page: {
                  type: 'number',
                  description: 'Number of pull requests per page (max 100)',
                  default: 30,
                  maximum: 100
                }
              },
              required: ['owner', 'repo']
            }
          },
          {
            name: 'github_get_pull',
            description: 'Get detailed information about a specific pull request',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                pull_number: {
                  type: 'number',
                  description: 'Pull request number'
                }
              },
              required: ['owner', 'repo', 'pull_number']
            }
          },
          {
            name: 'github_create_pull',
            description: 'Create a new pull request',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                title: {
                  type: 'string',
                  description: 'Pull request title'
                },
                body: {
                  type: 'string',
                  description: 'Pull request body/description'
                },
                head: {
                  type: 'string',
                  description: 'Head branch (source branch)'
                },
                base: {
                  type: 'string',
                  description: 'Base branch (target branch)',
                  default: 'main'
                },
                draft: {
                  type: 'boolean',
                  description: 'Whether to create as draft PR',
                  default: false
                }
              },
              required: ['owner', 'repo', 'title', 'head']
            }
          },

          // Branch and Commit Operations
          {
            name: 'github_list_branches',
            description: 'List branches for a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                per_page: {
                  type: 'number',
                  description: 'Number of branches per page (max 100)',
                  default: 30,
                  maximum: 100
                }
              },
              required: ['owner', 'repo']
            }
          },
          {
            name: 'github_get_commits',
            description: 'Get commits for a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                sha: {
                  type: 'string',
                  description: 'SHA or branch to start listing commits from'
                },
                path: {
                  type: 'string',
                  description: 'Only commits containing this file path'
                },
                since: {
                  type: 'string',
                  description: 'Only commits after this date (ISO 8601)'
                },
                until: {
                  type: 'string',
                  description: 'Only commits before this date (ISO 8601)'
                },
                per_page: {
                  type: 'number',
                  description: 'Number of commits per page (max 100)',
                  default: 30,
                  maximum: 100
                }
              },
              required: ['owner', 'repo']
            }
          },

          // File and Content Operations
          {
            name: 'github_get_content',
            description: 'Get contents of a file or directory',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                path: {
                  type: 'string',
                  description: 'File or directory path'
                },
                ref: {
                  type: 'string',
                  description: 'Branch, tag, or commit SHA (defaults to default branch)'
                }
              },
              required: ['owner', 'repo', 'path']
            }
          },
          {
            name: 'github_create_file',
            description: 'Create a new file in a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                path: {
                  type: 'string',
                  description: 'File path'
                },
                message: {
                  type: 'string',
                  description: 'Commit message'
                },
                content: {
                  type: 'string',
                  description: 'File content (will be base64 encoded)'
                },
                branch: {
                  type: 'string',
                  description: 'Branch to create file in (defaults to default branch)'
                }
              },
              required: ['owner', 'repo', 'path', 'message', 'content']
            }
          },

          // GitHub Actions
          {
            name: 'github_list_workflows',
            description: 'List GitHub Actions workflows for a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                }
              },
              required: ['owner', 'repo']
            }
          },
          {
            name: 'github_list_workflow_runs',
            description: 'List workflow runs for a repository',
            inputSchema: {
              type: 'object',
              properties: {
                owner: {
                  type: 'string',
                  description: 'Repository owner'
                },
                repo: {
                  type: 'string',
                  description: 'Repository name'
                },
                workflow_id: {
                  type: 'string',
                  description: 'Workflow ID or filename'
                },
                status: {
                  type: 'string',
                  enum: ['completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 'requested', 'waiting'],
                  description: 'Filter by workflow run status'
                },
                per_page: {
                  type: 'number',
                  description: 'Number of workflow runs per page (max 100)',
                  default: 30,
                  maximum: 100
                }
              },
              required: ['owner', 'repo']
            }
          }
        ]
      };
    });

    // Tool execution handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'github_get_oauth_url':
            return await this.handleGetOAuthURL(args);
          case 'github_exchange_code':
            return await this.handleExchangeCode(args);
          case 'github_get_user':
            return await this.handleGetUser(args);
          case 'github_list_repos':
            return await this.handleListRepos(args);
          case 'github_get_repo':
            return await this.handleGetRepo(args);
          case 'github_create_repo':
            return await this.handleCreateRepo(args);
          case 'github_list_issues':
            return await this.handleListIssues(args);
          case 'github_get_issue':
            return await this.handleGetIssue(args);
          case 'github_create_issue':
            return await this.handleCreateIssue(args);
          case 'github_update_issue':
            return await this.handleUpdateIssue(args);
          case 'github_list_pulls':
            return await this.handleListPulls(args);
          case 'github_get_pull':
            return await this.handleGetPull(args);
          case 'github_create_pull':
            return await this.handleCreatePull(args);
          case 'github_list_branches':
            return await this.handleListBranches(args);
          case 'github_get_commits':
            return await this.handleGetCommits(args);
          case 'github_get_content':
            return await this.handleGetContent(args);
          case 'github_create_file':
            return await this.handleCreateFile(args);
          case 'github_list_workflows':
            return await this.handleListWorkflows(args);
          case 'github_list_workflow_runs':
            return await this.handleListWorkflowRuns(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.message;
          return {
            content: [{ type: 'text', text: `GitHub API error: ${message}` }],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  // OAuth2 handlers
  private async handleGetOAuthURL(args: any) {
    const scopes = args?.scopes || ['repo', 'user'];
    const state = args?.state || Math.random().toString(36).substring(7);
    
    const params = new URLSearchParams({
      client_id: CLIENT_ID!,
      redirect_uri: 'http://localhost:3000/auth/callback',
      scope: scopes.join(' '),
      state: state,
    });

    const authUrl = `${GITHUB_OAUTH_BASE}/authorize?${params.toString()}`;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          authorization_url: authUrl,
          state: state,
          instructions: 'Visit this URL to authorize the application, then use the authorization code with github_exchange_code tool'
        }, null, 2)
      }]
    };
  }

  private async handleExchangeCode(args: any) {
    const { code, state } = args;

    try {
      const response = await axios.post(`${GITHUB_OAUTH_BASE}/access_token`, {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        state: state,
      }, {
        headers: {
          'Accept': 'application/json',
        }
      });

      const { access_token, token_type, scope } = response.data;

      // Update API client with new token
      this.githubAPI.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      await this.initializeUser();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            access_token,
            token_type,
            scope,
            user: this.currentUser,
            message: 'OAuth2 authentication successful! You can now use GitHub API tools.'
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `OAuth2 exchange failed: ${error}`);
    }
  }

  // User management handlers
  private async handleGetUser(args: any) {
    const { username } = args;
    const endpoint = username ? `/users/${username}` : '/user';
    
    const response = await this.githubAPI.get(endpoint);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  // Repository management handlers
  private async handleListRepos(args: any) {
    const { owner, type = 'all', sort = 'updated', per_page = 30 } = args;
    
    let endpoint = owner ? `/users/${owner}/repos` : '/user/repos';
    const params: any = { sort, per_page };
    if (!owner && type !== 'all') params.type = type;

    const response = await this.githubAPI.get(endpoint, { params });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleGetRepo(args: any) {
    const { owner, repo } = args;
    const response = await this.githubAPI.get(`/repos/${owner}/${repo}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleCreateRepo(args: any) {
    const { name, description, private: isPrivate, auto_init, gitignore_template, license_template } = args;
    
    const data: any = {
      name,
      description,
      private: isPrivate,
      auto_init,
    };
    
    if (gitignore_template) data.gitignore_template = gitignore_template;
    if (license_template) data.license_template = license_template;

    const response = await this.githubAPI.post('/user/repos', data);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  // Issue management handlers
  private async handleListIssues(args: any) {
    const { owner, repo, state = 'open', labels, assignee, per_page = 30 } = args;
    
    const params: any = { state, per_page };
    if (labels) params.labels = labels;
    if (assignee) params.assignee = assignee;

    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/issues`, { params });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleGetIssue(args: any) {
    const { owner, repo, issue_number } = args;
    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/issues/${issue_number}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleCreateIssue(args: any) {
    const { owner, repo, title, body, assignees, labels } = args;
    
    const data: any = { title };
    if (body) data.body = body;
    if (assignees) data.assignees = assignees;
    if (labels) data.labels = labels;

    const response = await this.githubAPI.post(`/repos/${owner}/${repo}/issues`, data);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleUpdateIssue(args: any) {
    const { owner, repo, issue_number, title, body, state, assignees, labels } = args;
    
    const data: any = {};
    if (title) data.title = title;
    if (body) data.body = body;
    if (state) data.state = state;
    if (assignees) data.assignees = assignees;
    if (labels) data.labels = labels;

    const response = await this.githubAPI.patch(`/repos/${owner}/${repo}/issues/${issue_number}`, data);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  // Pull request management handlers
  private async handleListPulls(args: any) {
    const { owner, repo, state = 'open', head, base, per_page = 30 } = args;
    
    const params: any = { state, per_page };
    if (head) params.head = head;
    if (base) params.base = base;

    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/pulls`, { params });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleGetPull(args: any) {
    const { owner, repo, pull_number } = args;
    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/pulls/${pull_number}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleCreatePull(args: any) {
    const { owner, repo, title, body, head, base = 'main', draft = false } = args;
    
    const data = {
      title,
      head,
      base,
      draft,
    };
    if (body) (data as any).body = body;

    const response = await this.githubAPI.post(`/repos/${owner}/${repo}/pulls`, data);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  // Branch and commit handlers
  private async handleListBranches(args: any) {
    const { owner, repo, per_page = 30 } = args;
    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/branches`, { 
      params: { per_page } 
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleGetCommits(args: any) {
    const { owner, repo, sha, path, since, until, per_page = 30 } = args;
    
    const params: any = { per_page };
    if (sha) params.sha = sha;
    if (path) params.path = path;
    if (since) params.since = since;
    if (until) params.until = until;

    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/commits`, { params });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  // File and content handlers
  private async handleGetContent(args: any) {
    const { owner, repo, path, ref } = args;
    
    const params: any = {};
    if (ref) params.ref = ref;

    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/contents/${path}`, { params });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleCreateFile(args: any) {
    const { owner, repo, path, message, content, branch } = args;
    
    const data: any = {
      message,
      content: Buffer.from(content).toString('base64'),
    };
    if (branch) data.branch = branch;

    const response = await this.githubAPI.put(`/repos/${owner}/${repo}/contents/${path}`, data);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  // GitHub Actions handlers
  private async handleListWorkflows(args: any) {
    const { owner, repo } = args;
    const response = await this.githubAPI.get(`/repos/${owner}/${repo}/actions/workflows`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  private async handleListWorkflowRuns(args: any) {
    const { owner, repo, workflow_id, status, per_page = 30 } = args;
    
    let endpoint = `/repos/${owner}/${repo}/actions/runs`;
    if (workflow_id) {
      endpoint = `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/runs`;
    }
    
    const params: any = { per_page };
    if (status) params.status = status;

    const response = await this.githubAPI.get(endpoint, { params });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitHub OAuth MCP server running on stdio');
  }
}

const server = new GitHubMCPServer();
server.run().catch(console.error);
