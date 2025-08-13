#!/usr/bin/env node

/**
 * GitHub MCP Server Setup Script
 * 
 * This script helps users set up the GitHub MCP Server with OAuth2 authentication.
 * It guides through the process of creating a GitHub OAuth app and configuring the environment.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { createInterface } from 'readline';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function log(message, type = 'info') {
    const colors = {
        info: '\x1b[36m',    // Cyan
        success: '\x1b[32m', // Green
        warning: '\x1b[33m', // Yellow
        error: '\x1b[31m',   // Red
        reset: '\x1b[0m'     // Reset
    };
    
    const prefix = {
        info: 'ℹ',
        success: '✓',
        warning: '⚠',
        error: '✗'
    };
    
    console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`);
}

function checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 18) {
        log(`Node.js version ${nodeVersion} detected. Version 18+ is required.`, 'error');
        process.exit(1);
    }
    
    log(`Node.js version ${nodeVersion} is compatible.`, 'success');
}

function installDependencies() {
    log('Installing MCP server dependencies...', 'info');
    try {
        execSync('cd github-oauth-server && npm install', { stdio: 'inherit' });
        log('MCP server dependencies installed successfully.', 'success');
    } catch (error) {
        log('Failed to install MCP server dependencies.', 'error');
        process.exit(1);
    }
    
    log('Building MCP server...', 'info');
    try {
        execSync('cd github-oauth-server && npm run build', { stdio: 'inherit' });
        log('MCP server built successfully.', 'success');
    } catch (error) {
        log('Failed to build MCP server.', 'error');
        process.exit(1);
    }
    
    log('Installing web UI dependencies...', 'info');
    try {
        execSync('cd web-ui && npm install', { stdio: 'inherit' });
        log('Web UI dependencies installed successfully.', 'success');
    } catch (error) {
        log('Failed to install web UI dependencies.', 'error');
        process.exit(1);
    }
}

async function setupEnvironment() {
    log('\n=== GitHub OAuth2 Configuration ===', 'info');
    
    console.log(`
Before continuing, you need to create a GitHub OAuth App:

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the details:
   - Application name: GitHub MCP Server
   - Homepage URL: http://localhost:3000
   - Authorization callback URL: http://localhost:3000/auth/callback
4. Save and copy the Client ID and Client Secret

Press Enter when ready to continue...`);
    
    await question('');
    
    const clientId = await question('Enter your GitHub Client ID: ');
    if (!clientId.trim()) {
        log('Client ID is required.', 'error');
        process.exit(1);
    }
    
    const clientSecret = await question('Enter your GitHub Client Secret: ');
    if (!clientSecret.trim()) {
        log('Client Secret is required.', 'error');
        process.exit(1);
    }
    
    const port = await question('Enter port number (default: 3000): ') || '3000';
    
    // Create .env file
    const envContent = `# GitHub OAuth2 Configuration
GITHUB_CLIENT_ID=${clientId}
GITHUB_CLIENT_SECRET=${clientSecret}

# Server Configuration
PORT=${port}
REDIRECT_URI=http://localhost:${port}/auth/callback

# Environment
NODE_ENV=development
`;
    
    try {
        writeFileSync('web-ui/.env', envContent);
        log('Environment configuration saved to web-ui/.env', 'success');
    } catch (error) {
        log('Failed to create .env file.', 'error');
        process.exit(1);
    }
}

function displayNextSteps() {
    log('\n=== Setup Complete! ===', 'success');
    
    console.log(`
🚀 Next steps:

1. Start the web UI server:
   cd web-ui
   npm start

2. Open your browser and go to:
   http://localhost:3000

3. Authenticate with GitHub and copy the MCP configuration

4. Add the configuration to your MCP client settings

For detailed instructions, see README.md

Happy coding! 🎉
`);
}

async function main() {
    console.log(`
╔══════════════════════════════════════════╗
║       GitHub MCP Server Setup            ║
║   OAuth2 Authentication & Web UI        ║
╚══════════════════════════════════════════╝
`);
    
    try {
        log('Checking Node.js version...', 'info');
        checkNodeVersion();
        
        log('Installing dependencies...', 'info');
        installDependencies();
        
        await setupEnvironment();
        
        displayNextSteps();
        
    } catch (error) {
        log(`Setup failed: ${error.message}`, 'error');
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
    log('\nSetup cancelled by user.', 'warning');
    rl.close();
    process.exit(0);
});

main().catch(error => {
    log(`Unexpected error: ${error.message}`, 'error');
    process.exit(1);
});
