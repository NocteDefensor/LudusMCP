# LudusMCP

Model Context Protocol server for managing Ludus lab environments through natural language commands.

## Prerequisites

For detailed information, please refer to the [wiki](https://github.com/NocteDefensor/LudusMCP/wiki#ludus-mcp-server)

### System Requirements
- Node.js 18.0.0 or higher
- npm package manager
- Ludus CLI binary [installed](https://docs.ludus.cloud/docs/quick-start/using-cli-locally) and in PATH on host with the mcp-client(ex. claude desktop)
- Active Ludus server environment
- Network connectivity to Ludus server via WireGuard VPN or SSH

### Ludus Server Access
Ensure you have:
- Ludus server SSH access credentials
- Ludus API key (obtain via `ludus user apikey` command)
- WireGuard configuration file OR SSH tunnel capabilities (obtain wireguard conf from Ludus CLI)
- Admin USERID for Ludus server.

## Installation

**NOTE** The MCP server can be installed either on a remote device with an MCP client (ex Claude Desktop) that has access to the Ludus server via WireGuard/SSH, OR directly on the Ludus server itself using "direct" connection mode.

### Global Installation (Recommended)
Install the package globally to make the `ludus-mcp` command available system-wide:

```bash
npm install -g ludus-mcp@latest
ludus-mcp --setup-keyring
```

**What happens during installation:**
1. Downloads source code and dependencies
2. Compiles native dependencies (`keytar`) for your platform (Windows/Linux/macOS)
3. Builds TypeScript source to JavaScript (`src/` → `dist/`)
4. Creates global `ludus-mcp` command in your PATH

This is a **one-time installation process** that compiles everything for your specific platform.

### From Source (Development)
```bash
git clone https://github.com/NocteDefensor/LudusMCP.git
cd LudusMCP
From within LudusMCP directory
npm install    # Installs dependencies and builds automatically
npx ludus-mcp --setup-keyring  # Use npx for local from source installations by running it from within clone/install directory
```

### Installation Requirements
The package includes native dependencies that require compilation during installation:
- **Build tools**: Node.js build tools (automatically installed)
- **Platform libraries**: OS credential manager libraries (Windows Credential Manager, macOS Keychain, Linux libsecret)

If installation fails, ensure you have proper build tools for your platform.

## Updating

### NPM Global Install

```bash
npm install -g ludus-mcp@latest
```

### Local Development Install

```bash
cd LudusMCP
git pull origin main
npm install
npm run build
```

## Configuration

### Initial Setup
Run the setup wizard to configure credentials securely: (from within cloned directory if installing from source)

```bash
npx ludus-mcp --setup-keyring
```

The setup wizard will prompt for:
- **Connection Method**: WireGuard VPN or SSH tunnel
- **Ludus Admin Username**: Your Ludus admin account USER ID
- **API Key**: Ludus API key from `ludus user apikey` command.
- **SSH Credentials**: Host, username, and authentication method
- **WireGuard Config**: Path to .conf file (if using WireGuard)

**NOTE** Do not use quotes or single quotes around any values during the keyring setup or renew operations.

Credentials are stored securely in your OS credential manager (Windows Credential Manager, macOS Keychain, Linux Secret Service).

### Update Credentials (from within cloned directory if installing from source)
To modify existing credentials:

```bash
npx ludus-mcp --renew-keyring
```

### Connection Methods

**WireGuard VPN**
- Direct connection to Ludus server for non admin functions via VPN tunnel
- Requires WireGuard client and configuration file
- Must be manually started before using MCP client
- Will still use SSH tunnel for ADMIN ops due to ADMIN API only available localhost on Ludus Server.

**SSH Tunnel**
- Port forwarding through SSH connection
- Fallback option when WireGuard unavailable
- Automatically managed by MCP server
- SSH tunnel will always be used for ADMIN API

**Direct Mode (Running on Ludus Server)**
- Connect directly to localhost without any tunnels
- Use this when running the MCP server directly on the Ludus host machine
- No WireGuard or SSH configuration required
- Full access to both regular API (port 8080) and admin API (port 8081)
- Ideal for Claude Code running directly on the Ludus server

To use direct mode, select `(d) Direct` during the setup wizard:
```bash
ludus-mcp --setup-keyring
# Select connection method: d
```

## MCP Client Integration

### Setup Process Overview
1. **Install Package** (one-time) - Compiles for your platform
2. **Configure Credentials** (one-time) - Run setup wizard
3. **Configure MCP Client** (one-time) - Add to client config
4. **Daily Usage** - Start MCP client, server auto-connects

### Claude Desktop Configuration

Find your Claude Desktop configuration file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ludus": {
      "command": "ludus-mcp"
    }
  },
  "isUsingBuiltInNodeForMcp": true
}
```

### Claude Code (CLI) Configuration

Claude Code supports MCP servers through its CLI or configuration files.

**Option 1: Install via CLI (Recommended)**
```bash
# Add LudusMCP as an MCP server
claude mcp add ludus -- npx -y ludus-mcp

# Or with user scope (available across all projects)
claude mcp add ludus --scope user -- npx -y ludus-mcp

# On Windows (not WSL)
claude mcp add ludus -- cmd /c npx -y ludus-mcp
```

**Option 2: Manual Configuration**

Create or edit `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "ludus": {
      "command": "ludus-mcp"
    }
  }
}
```

Or for project-specific configuration, create `.claude/mcp.json` in your project directory.

**Managing the MCP Server:**
```bash
claude mcp list          # List configured servers
claude mcp get ludus     # Get server details
claude mcp remove ludus  # Remove the server
```

**For source installations with Claude Code:**
```bash
claude mcp add ludus -- node /path/to/LudusMCP/dist/server.js
```

Or manually in `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "ludus": {
      "command": "node",
      "args": ["/path/to/LudusMCP/dist/server.js"]
    }
  }
}
```

### Development/Source Installation
If running from source:

```json
{
  "mcpServers": {
    "ludus": {
      "command": "node",
      "args": ["/path/to/LudusMCP/dist/server.js"]
    }
  },
  "isUsingBuiltInNodeForMcp": false
}
```

### Running Directly on Ludus Server

For scenarios where you want to run the MCP server directly on the Ludus host machine (e.g., using Claude Code via SSH), use **Direct Mode**:

**Installation on Ludus Server:**
```bash
# Option 1: Install via Claude Code CLI (Recommended)
claude mcp add ludus --scope user -- npx -y ludus-mcp

# Option 2: Install globally via npm
npm install -g ludus-mcp@latest
```

**Configure Direct Mode:**
```bash
# Run setup and select direct mode
ludus-mcp --setup-keyring
# When prompted for connection method, select: (d) Direct
# Only admin username and API key are required for direct mode
```

**Alternative: Manual Claude Code Configuration**

Create `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "ludus": {
      "command": "ludus-mcp"
    }
  }
}
```

**Benefits of Direct Mode:**
- No network tunnels required (WireGuard or SSH)
- Direct localhost access to both regular (8080) and admin (8081) APIs
- Simplified setup - only requires admin username and API key
- Lower latency for API operations
- Ideal for headless server environments or remote SSH sessions with Claude Code

**Environment Variables (Alternative to Keyring):**
```bash
export LUDUS_ADMIN_USER=your-admin-user
export LUDUS_API_KEY=your-api-key
export LUDUS_CONNECTION_METHOD=direct
```

## Usage

### Normal Operation
When you start your MCP client (Claude Desktop), it automatically:
1. Launches the pre-compiled `ludus-mcp` server
2. Server loads credentials from OS keyring  
3. Downloads fresh configurations from GitHub
4. Downloads updated schemas and documentation
5. Tests connectivity to Ludus server
6. Starts MCP protocol for tool communication

No manual server startup required - your MCP client handles everything.

### Manual Server Testing (Optional)
For troubleshooting or testing the server independently:
**NOTE** You do not need to manually start server prior to running your mcp client such as claude desktop. MCP client will automatically start the MCP server. This manual start below is for testing only. 

```bash
ludus-mcp  # If globally installed
# OR
npx ludus-mcp  # run from cloned directory if locally installed
```

**Server Startup Process:**
1. **Load Credentials** - Retrieves stored credentials from OS keyring
2. **Download Assets** - Updates base configurations, schemas, and documentation from GitHub
3. **Connectivity Test** - Verifies connection to Ludus server via WireGuard/SSH
4. **MCP Protocol** - Starts Model Context Protocol server for tool communication

### Available Prompts

**create-ludus-range**
Complete guided workflow for range creation from requirements to deployment.

**execute-ludus-cmd** 
Safe execution of Ludus CLI commands with destructive action protection.

- To use prompts with Claude Desktop hunt for the "plus" + button near your chat bar.
  - Click "add from ludus and you will see both prompts. Select the one you want.
  
<img width="1056" height="216" alt="image" src="https://github.com/user-attachments/assets/617b9205-2dc3-4e1e-8663-90fb9857b3cf" />


### Available Tools

**Range Management**
- `deploy_range` - Deploy virtualized training environment
- `get_range_status` - Check deployment status and VM states
- `list_user_ranges` - List all ranges for user
- `get_connection_info` - Download RDP/VPN connection files
- `destroy_range` - Permanently delete range and VMs
- `range_abort` - Stop stuck deployments
- `ludus_power` - Start/stop range VMs

**Configuration Management**
- `read_range_config` - Read configuration files
- `write_range_config` - Create/modify range configurations
- `validate_range_config` - Validate YAML syntax and schema
- `list_range_configs` - Browse available templates
- `get_range_config` - Get currently active configuration
- `set_range_config` - Set active configuration for deployment

**Documentation & Research**
- `ludus_docs_search` - Search Ludus documentation
- `ludus_range_planner` - Intelligent range planning assistant
- `ludus_roles_search` - Search available Ludus roles
- `ludus_environment_guides_search` - Find environment setup guides
- `ludus_networking_search` - Network configuration help
- `ludus_read_range_config_schema` - View configuration schema
- `ludus_range_config_check_against_plan` - Validate against requirements
- `ludus_read_role_collection_schema` - View role schemas
- `ludus_list_role_collection_schemas` - List all available role/collection schemas

**Utility & Administration**
- `ludus_cli_execute` - Execute arbitrary Ludus CLI commands
- `ludus_help` - Get help for Ludus commands
- `list_all_users` - List all Ludus users (admin only)
- `get_credential_from_user` - Securely collect credentials
- `insert_creds_range_config` - Inject credentials into configurations (note: the LLM doesn't actually interact with OS credential management/keyring at all. It passes the name the credential is stored under to the function. The function retrieves the credential and replaces placeholder with cred. 

### Role and Collection Schemas

The MCP server maintains detailed schemas for all available Ludus roles and collections to help the LLM understand role capabilities, variables, and requirements during range planning.

**Schema Location**
Official schemas are stored in `~/.ludus-mcp/schemas/` as individual YAML files, one per role or collection. These are automatically downloaded and updated from the GitHub repository on server startup.

**Schema Tools**
- `ludus_list_role_collection_schemas` - List all available role/collection schema files
- `ludus_read_role_collection_schema` - Read schema data (all schemas or specific files)

**Adding Custom Schemas**
To add schemas for custom roles or third-party roles not in the official repository:

1. Create a YAML file in `~/.ludus-mcp/schemas/` following the standard format
2. Use a distinctive name to avoid conflicts (e.g., `company.custom_role.yaml`)
3. Include all required fields: `name`, `type`, `description`, `variables`
4. Refer to `Sample-schema.yaml` in the schemas directory for proper formatting and structure

**Schema Persistence**
Custom schemas are preserved during server restarts. The update process only overwrites official schemas from the repository, leaving your custom files intact.

**Filtered Reading**
Use `ludus_read_role_collection_schema` with the `file_names` parameter to read specific schemas instead of all schemas at once.

### Recommended Workflow

1. **Plan Your Range**
   Use the `create-ludus-range` prompt for guided range creation:
   ```
   Requirements: "AD environment with SCCM and 3 workstations"
   ```

2. **Review Configuration**
   Use `list_range_configs` to see available templates and `read_range_config` to examine them.

3. **Validate Before Deployment**
   Always run `validate_range_config` before setting configuration.

4. **Set Active Configuration**
   Use `set_range_config` to make configuration active for deployment.

5. **Deploy Range**
   Use `deploy_range` to create the virtualized environment.

6. **Get Connection Info**
   Use `get_connection_info` to download RDP files and access VMs.

### Extensive or Advanced CLI Operations

For operations not covered by specific tools, use the `execute-ludus-cmd` prompt:
```
Command Intent: "Check detailed logs for deployment issues"
```

## File Locations

Configuration files and data are stored in `~/.ludus-mcp/`:

```
~/.ludus-mcp/
├── range-config-templates/
│   └── base-configs/           # GitHub templates (auto-updated)
├── schemas/                    # Role/collection schemas (auto-updated)
│   ├── Sample-schema.yaml     # Template for custom schemas
│   ├── ludus_sccm.yaml        # Individual role schemas
│   ├── badsectorlabs.ludus_vulhub.yaml
│   ├── custom_role.yaml       # Your custom schemas (preserved)
│   └── range-config.json      # Range configuration schema
└── ludus-docs/                 # Cached documentation (auto-updated)
    ├── environment-guides/
    ├── quick-start/
    └── troubleshooting/
```

Official project files are automatically downloaded and updated on server startup. Custom files you create are preserved.

## Security
- This is for lab use only. Security is marginal. Some attempts have been made to limit OS command injection or path traversal. Additionally, credentials are handled via OS credential manager.
### Credential Management
- External service credentials (API keys, SaaS tokens) use placeholder format: `{{LudusCredName-<user>-<name>}}`
- Range-internal credentials (AD passwords, domain accounts) included directly
- All credentials stored in OS credential manager
- Secure dialogs for credential collection

### Networking
- WireGuard VPN for server communication
- SSH tunnel fallback or SSH primary with key-based or password based authentication

### Operational Safety
- Destructive operations should require explicit confirmation but highly recommend you don't "always allow" access to dangerous tools such as destroy_range and you closely observe usage. Its an LLM and sometimes it does weird stuff.
- Should automatically validate configurations before deployment. It will definitely go through syntax/range schema validation as part of write process.

## Troubleshooting

- Logs are stored in `~/.ludus-mcp/logs`

### Connection Issues
- Verify WireGuard tunnel is active: `wg show`
- Test SSH connectivity: `ssh user@ludus-host`
- Check API key: `ludus --url https://your-server:8080 version`

### Configuration Problems
- Run `validate_range_config` to check syntax
- Use `ludus_read_range_config_schema` to verify structure
- Check logs for specific error messages

### Credential Issues
- Re-run setup: `npx ludus-mcp --renew-keyring`
- Verify OS credential manager access
- Check file permissions on WireGuard config

### Common Errors
- "No configuration available": Run `--setup-keyring`
- "Range operations connectivity failed": Check WireGuard/SSH
- "Schema validation failed": Use `validate_range_config` tool

## Help

For additional help:
- Use `ludus_help` tool for Ludus CLI documentation
- Use `ludus_docs_search` for comprehensive guides  
- Review generated configurations with `read_range_config`
- Check [GitHub repository](https://github.com/NocteDefensor/LudusMCP) for issues and updates
## References:
- Ludus Documentation - https://docs.ludus.cloud/docs/intro
## Coming Changes
- May switch to [Desktop Extension](https://www.anthropic.com/engineering/desktop-extensions) setup vs the current homegrown keyring config/renew functions.
- May make a remote mcp server version to be able to interact with ludus from any device on network regardless of having ludus cli present etc.
- Will add more sample reference templates. 
- Will attempt to keep up with new roles by adding them to the schema for LLM reference.
## Credits
- Ludus - [@badsectorlabs](https://x.com/badsectorlabs)
- Claude - Wouldn't quite call this project vibe coding but maybe 4 beers deep in the passenger seat shouting out navigation commands.
- Reddit MCP channel for lots of researching
- MCP documentation - https://modelcontextprotocol.io/introduction
- Anthropic MCP docs - https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector
- MCP in VS Code - https://code.visualstudio.com/docs/copilot/chat/mcp-servers
## License
GNU General Public License v3.0
