# Ludus MCP Server

Model Context Protocol server for managing Ludus cybersecurity training environments through natural language commands.

## Prerequisites

### System Requirements
- Node.js 18.0.0 or higher
- npm package manager
- Ludus CLI binary [installed](https://docs.ludus.cloud/docs/quick-start/using-cli-locally) and in PATH
- Active Ludus server environment
- Network connectivity to Ludus server via WireGuard VPN or SSH

### Ludus Server Access
Ensure you have:
- Ludus server SSH access credentials
- Ludus API key (obtain via `ludus apikey` command)
- WireGuard configuration file OR SSH tunnel capabilities (obtain wireguard conf from Ludus CLI)
- Admin or user account on Ludus server. Non admin will be limited in same ways as using ludus cli with non admin account.

## Installation

### Global Installation (Recommended) (not yet pushed to NPM - will not work for now. clone repo and install from source as long as this message is up)
Install the package globally to make the `ludus-mcp` command available system-wide:

```bash
npm install -g ludus-mcp
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
npx ludus-mcp --setup-keyring  # Use npx for local installations
```

### Installation Requirements
The package includes native dependencies that require compilation during installation:
- **Build tools**: Node.js build tools (automatically installed)
- **Platform libraries**: OS credential manager libraries (Windows Credential Manager, macOS Keychain, Linux libsecret)

If installation fails, ensure you have proper build tools for your platform.

## Configuration

### Initial Setup
Run the setup wizard to configure credentials securely: (from within cloned directory if installing from source)

```bash
npx ludus-mcp --setup-keyring
```

The setup wizard will prompt for:
- **Connection Method**: WireGuard VPN or SSH tunnel
- **Ludus Admin Username**: Your Ludus admin account
- **API Key**: Ludus API key from `ludus apikey` command  
- **SSH Credentials**: Host, username, and authentication method
- **WireGuard Config**: Path to .conf file (if using WireGuard)

Credentials are stored securely in your OS credential manager (Windows Credential Manager, macOS Keychain, Linux Secret Service).

### Update Credentials (from within cloned directory if installing from source)
To modify existing credentials:

```bash
npx ludus-mcp --renew-keyring
```

### Connection Methods

**WireGuard VPN (Recommended)**
- Direct connection to Ludus server for non admin functions via VPN tunnel
- Requires WireGuard client and configuration file
- Must be manually started before using MCP client

**SSH Tunnel**
- Port forwarding through SSH connection
- Fallback option when WireGuard unavailable
- Automatically managed by MCP server
- SSH tunnel will always be used for ADMIN API

## MCP Client Integration

### Setup Process Overview
1. **Install Package** (one-time) - Compiles for your platform
2. **Configure Credentials** (one-time) - Run setup wizard
3. **Configure MCP Client** (one-time) - Add to client config
4. **Daily Usage** - Start MCP client, server auto-connects

### Claude Desktop Configuration

**For Global Installation:**
Add to your `~/.claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ludus": {
      "command": "ludus-mcp"
    }
  },
  "isUsingBuiltInNodeForMcp": false
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

**Utility & Administration**
- `ludus_cli_execute` - Execute arbitrary Ludus CLI commands
- `ludus_help` - Get help for Ludus commands
- `list_all_users` - List all Ludus users (admin only)
- `get_credential_from_user` - Securely collect credentials
- `insert_creds_range_config` - Inject credentials into configurations

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
├── schemas/                    # JSON schemas (auto-updated)
│   ├── ludus-roles-collections-schema.json
│   └── range-config.json
└── ludus-docs/                 # Cached documentation (auto-updated)
    ├── environment-guides/
    ├── quick-start/
    └── troubleshooting/
```

All files are automatically downloaded and updated on server startup.

## Security
- This is for lab use only. Security is marginal. Some attempts have been made to limit OS command injection or path traversal. Additionally, credentials are handled via OS credential manager.
### Credential Management
- External service credentials (API keys, SaaS tokens) use placeholder format: `{{LudusCredName-<user>-<name>}}`
- Range-internal credentials (AD passwords, domain accounts) included directly
- All credentials stored in OS credential manager
- Secure dialogs for credential collection

### Network Security
- WireGuard VPN encryption for server communication
- SSH tunnel fallback with key-based authentication
- SSL certificate verification (configurable)

### Operational Safety
- Destructive operations require explicit confirmation
- Automatic validation of configurations before deployment
- Comprehensive logging and error handling

## Troubleshooting

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
## License

MIT License 
