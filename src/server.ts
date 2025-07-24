#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from './utils/logger.js';
import { InteractiveSetup, LudusConfig } from './ludus/interactiveSetup.js';
import path from 'path';
import { LudusCliWrapper } from './ludus/cliWrapper.js';
import { ALL_PROMPTS } from './prompts/index.js';
import { handleCreateLudusRangePrompt } from './prompts/createLudusRange.js';
import { handleExecuteLudusCmdPrompt } from './prompts/executeLudusCmd.js';
import {
  deployRangeTool,
  getRangeStatusTool,
  listUserRangesTool,
  getConnectionInfoTool,
  destroyRangeTool,
  rangeAbortTool,
  getTagsTool,
  ludusCliExecuteTool,
  ludusHelpTool,
  listAllUsersTool,
  readRangeConfigTool,
  writeRangeConfigTool,
  validateRangeConfigTool,
  listRangeConfigsTool,
  getRangeConfigTool,
  setRangeConfigTool,
  ludusPowerTool,
  getCredentialFromUserTool,
  insertCredsRangeConfigTool,
  ludusDocsSearchTool,
  ludusRangePlannerTool,
  ludusRolesSearchTool,
  ludusEnvironmentGuidesSearchTool,
  ludusNetworkingSearchTool,
  ludusReadRangeConfigSchemaTool,
  ludusRangeConfigCheckAgainstPlanTool,
  ludusReadRoleCollectionSchemaTool,
  ludusListRoleCollectionSchemasTool
} from './tools/index.js';
import { handleListAllUsers } from './tools/listAllUsers.js';
import { handleReadRangeConfig, handleWriteRangeConfig, handleValidateRangeConfig, handleListRangeConfigs, handleGetRangeConfig } from './tools/rangeConfig.js';
import { handleInsertCredsRangeConfig } from './tools/insertCredsRangeConfig.js';
import { handleSetRangeConfig } from './tools/setRangeConfig.js';
import { handleGetConnectionInfo } from './tools/getConnectionInfo.js';
import { handleDestroyRange } from './tools/destroyRange.js';
import { handleLudusPower } from './tools/ludusPower.js';
import { handleGetCredentialFromUser } from './tools/getCredentialFromUser.js';
import { handleLudusDocsSearch } from './tools/ludusDocsSearch.js';
import { handleLudusRangePlanner } from './tools/ludusRangePlanner.js';
import { handleLudusRolesDocsRead } from './tools/ludusRolesSearch.js';
import { handleLudusEnvironmentGuidesSearch } from './tools/ludusEnvironmentGuidesSearch.js';
import { handleLudusNetworkingDocsRead } from './tools/ludusNetworkingSearch.js';
import { handleLudusReadRangeConfigSchema } from './tools/ludusReadRangeConfigSchema.js';
import { handleLudusRangeConfigCheckAgainstPlan } from './tools/ludusRangeConfigCheckAgainstPlan.js';
import { handleLudusReadRoleCollectionSchema } from './tools/ludusReadRoleCollectionSchema.js';
import { handleLudusListRoleCollectionSchemas } from './tools/ludusListRoleCollectionSchemas.js';
import { 
  getCredentials, 
  CREDENTIAL_KEYS, 
  isKeyringSupportAvailable 
} from './utils/keyring.js';
import { downloadLudusDocumentation } from './utils/downloadDocs.js';
import { downloadBaseConfigs } from './utils/downloadBaseConfigs.js';
import { downloadSchemas } from './utils/downloadSchemas.js';

class LudusMCPServer {
  private server: Server;
  private logger: Logger;
  private ludusConfig: LudusConfig | null = null;
  private ludusCliWrapper: LudusCliWrapper | null = null;

  constructor() {
    this.logger = new Logger('LudusMCPServer');
    this.logger.info('Ludus MCP Server starting', {
      nodeVersion: process.version,
      platform: process.platform,
      workingDir: process.cwd(),
      args: process.argv,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        LUDUS_DEBUG: process.env.LUDUS_DEBUG,
        LUDUS_FILE_LOGGING: process.env.LUDUS_FILE_LOGGING,
        PATH: process.env.PATH?.substring(0, 200) + '...'
      }
    });
    
    this.server = new Server(
      {
        name: 'ludus-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupPromptHandlers();
    this.setupErrorHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          deployRangeTool,
          getRangeStatusTool,
          listUserRangesTool,
          getConnectionInfoTool,
          destroyRangeTool,
          rangeAbortTool,
          getTagsTool,
          ludusCliExecuteTool,
          ludusHelpTool,
          listAllUsersTool,
          readRangeConfigTool,
          writeRangeConfigTool,
          validateRangeConfigTool,
          listRangeConfigsTool,
          getRangeConfigTool,
          setRangeConfigTool,
          ludusPowerTool,
          getCredentialFromUserTool,
          insertCredsRangeConfigTool,
          ludusDocsSearchTool,
          ludusRangePlannerTool,
          ludusRolesSearchTool,
          ludusEnvironmentGuidesSearchTool,
          ludusNetworkingSearchTool,
          ludusReadRangeConfigSchemaTool,
          ludusRangeConfigCheckAgainstPlanTool,
          ludusReadRoleCollectionSchemaTool,
          ludusListRoleCollectionSchemasTool
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'deploy_range':
            return await this.handleDeployRange(args);
          case 'get_range_status':
            return await this.handleGetRangeStatus(args);
          case 'list_user_ranges':
            return await this.handleListUserRanges(args);
          case 'get_connection_info':
            return await this.handleGetConnectionInfo(args);
          case 'destroy_range':
            return await this.handleDestroyRange(args);
          case 'range_abort':
            return await this.handleRangeAbort(args);
          case 'get_tags':
            return await this.handleGetTags(args);
          case 'ludus_cli_execute':
            return await this.handleLudusCliExecute(args);
          case 'ludus_help':
            return await this.handleLudusHelp(args);
          case 'list_all_users':
            return await this.handleListAllUsers(args);
          case 'read_range_config':
            return await this.handleReadRangeConfig(args);
          case 'write_range_config':
            return await this.handleWriteRangeConfig(args);
          case 'validate_range_config':
            return await this.handleValidateRangeConfig(args);
          case 'list_range_configs':
            return await this.handleListRangeConfigs(args);
          case 'get_range_config':
            return await this.handleGetRangeConfig(args);
          case 'set_range_config':
            return await this.handleSetRangeConfig(args);
          case 'ludus_power':
            return await this.handleLudusPower(args);
                  case 'get_credential_from_user':
          return await this.handleGetCredentialFromUser(args);
        case 'insert_creds_range_config':
          return await this.handleInsertCredsRangeConfig(args);
        case 'ludus_docs_search':
          return await this.handleLudusDocsSearch(args);
        case 'ludus_range_planner':
          return await this.handleLudusRangePlanner(args);
        case 'ludus_roles_search':
          return await this.handleLudusRolesDocsRead(args);
        case 'ludus_environment_guides_search':
          return await this.handleLudusEnvironmentGuidesSearch(args);
        case 'ludus_networking_search':
          return await this.handleLudusNetworkingDocsRead(args);
        case 'ludus_read_range_config_schema':
          return await this.handleLudusReadRangeConfigSchema(args);
        case 'ludus_range_config_check_against_plan':
          return await this.handleLudusRangeConfigCheckAgainstPlan(args);
        case 'ludus_read_role_collection_schema':
          return await this.handleLudusReadRoleCollectionSchema(args);
        case 'ludus_list_role_collection_schemas':
          return await this.handleLudusListRoleCollectionSchemas(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        this.logger.error('Tool execution failed', error, { tool: name });
        throw error;
      }
    });
  }

  private async handleDeployRange(args: any) {
    const { 
      user, 
      configPath, 
      force = false, 
      tags, 
      limit, 
      onlyRoles, 
      verboseAnsible = false 
    } = args;
    
    this.logger.info('Deploying range', { 
      user, 
      configPath, 
      force, 
      tags, 
      limit, 
      onlyRoles, 
      verboseAnsible 
    });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      // Build options object, filtering out undefined values
      const deployOptions: any = { force, verboseAnsible };
      if (user !== undefined) deployOptions.user = user;
      if (configPath !== undefined) deployOptions.configPath = configPath;
      if (tags !== undefined) deployOptions.tags = tags;
      if (limit !== undefined) deployOptions.limit = limit;
      if (onlyRoles !== undefined) deployOptions.onlyRoles = onlyRoles;

      // Deploy the range with all options
      const result = await this.ludusCliWrapper!.deployRange(deployOptions);
      
      if (!result.success) {
        throw new Error(`Failed to deploy range: ${result.message}`);
      }

      const targetUser = user || 'current user';
      
      return {
        content: [
          {
            type: 'text',
            text: `Range deployment initiated successfully for ${targetUser}\n\n` +
                  `${configPath ? `Configuration: ${configPath}\n` : 'Using existing configuration\n'}` +
                  `Status: ${result.data ? JSON.stringify(result.data, null, 2) : 'Deployment started'}\n\n` +
                  `Deployment Progress:\n` +
                  `- Configuration applied\n` +
                  `- VMs are being created and configured\n` +
                  `- This typically takes 10-30 minutes\n\n` +
                  `Next Steps:\n` +
                  `- Monitor progress: get_range_status()\n` +
                  `- Get connection info once ready: get_connection_info()\n` +
                  `- Check deployment logs if needed`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Range deployment failed: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify configuration file is valid (if provided)\n` +
                  `- Check if you have permission to deploy ranges\n` +
                  `- Ensure WireGuard VPN is connected\n` +
                  `- Try: list_user_ranges() to check current status`
          }
        ]
      };
    }
  }

  private async handleGetRangeStatus(args: any) {
    const { user } = args;
    
    this.logger.info('Getting range status', { user });
    
    try {
      const result = await this.ludusCliWrapper!.getRangeStatus(user);
      
      if (!result.success) {
        throw new Error(`Failed to get range status: ${result.message}`);
      }

      const targetUser = user || 'current user';
      
      return {
        content: [
          {
            type: 'text',
            text: `Range Status for ${targetUser}\n\n` +
                  `${JSON.stringify(result.data, null, 2)}\n\n` +
                  `Usage:\n` +
                  `- If deploying: Wait for completion, then use get_connection_info()\n` +
                  `- If ready: Use get_connection_info() to access VMs\n` +
                  `- If stopped: Use deploy_range() to deploy a new range`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get range status: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the user has a deployed range\n` +
                  `- Check admin permissions (if querying other users)\n` +
                  `- Try: list_user_ranges() to see all ranges\n` +
                  `- Deploy a range first if none exists`
          }
        ]
      };
    }
  }

  private async handleListUserRanges(args: any) {
    const { user } = args;
    
    this.logger.info('Listing user ranges', { user });
    
    try {
      const result = await this.ludusCliWrapper!.listUserRanges(user);
      
      if (!result.success) {
        throw new Error(`Failed to list ranges: ${result.message}`);
      }

      const targetUser = user || 'current user';
      const ranges = result.data;
      
      let statusText = `Ranges for ${targetUser}\n\n`;
      
      if (Array.isArray(ranges) && ranges.length > 0) {
        statusText += `Found ${ranges.length} range(s):\n\n`;
        statusText += JSON.stringify(ranges, null, 2);
      } else if (ranges) {
        statusText += `Range information:\n\n`;
        statusText += JSON.stringify(ranges, null, 2);
      } else {
        statusText += `No ranges found.\n\n`;
        statusText += `Next Steps:\n`;
        statusText += `- Deploy your first range: deploy_range()\n`;
        statusText += `- Check available templates: list_templates()`;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: statusText
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list ranges: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the user exists in Ludus\n` +
                  `- Check admin permissions (if querying other users)\n` +
                  `- Ensure WireGuard VPN is connected\n` +
                  `- Try deploying a range first if none exist`
          }
        ]
      };
    }
  }

  private async handleGetConnectionInfo(args: any) {
    this.logger.info('Getting connection info via tool wrapper', { args });
    
    try {
      // Use the tool wrapper that includes download location information
      const result = await handleGetConnectionInfo(args, this.logger, this.ludusCliWrapper!);
      
      if (!result.success) {
        throw new Error(result.message);
      }

             const targetUser = result.user;
       const downloadLocation = result.rdpDownloadLocation;
       
       let connectionText = `🔗 Connection Information for ${targetUser}\n`;
       connectionText += `📂 Files saved to: ${downloadLocation}\n\n`;
         
       if (result.connections.rdp?.available) {
         connectionText += `RDP Configuration:\n`;
         connectionText += `   File: ${result.connections.rdp.filePath}\n`;
         connectionText += `   ${result.connections.rdp.usage}\n\n`;
       }
       
       if (result.connections.wireguard?.available) {
         connectionText += `WireGuard VPN Configuration:\n`;
         connectionText += `   File: ${result.connections.wireguard.filePath}\n`;
         connectionText += `   ${result.connections.wireguard.usage}\n\n`;
       }
       
       if (result.connections.etcHosts?.available) {
         connectionText += `/etc/hosts Entries:\n`;
         connectionText += `   File: ${result.connections.etcHosts.filePath}\n`;
         connectionText += `   ${result.connections.etcHosts.usage}\n\n`;
       }
      
      connectionText += `Usage Instructions:\n`;
      if (result.usageInstructions && result.usageInstructions.length > 0) {
        result.usageInstructions.forEach((instruction: string) => {
          connectionText += `- ${instruction}\n`;
        });
      }
      
      return {
        content: [
          {
            type: 'text',
            text: connectionText
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get connection info: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the user has a deployed range\n` +
                  `- Check if range is fully deployed (not just deploying)\n` +
                  `- Try: get_range_status() to check deployment progress\n` +
                  `- Ensure admin permissions (if querying other users)`
          }
        ]
      };
    }
  }

  private async handleDestroyRange(args: any) {
    const { user, force = false } = args;
    
    this.logger.info('Destroying range', { user, force });
    
    try {
      const targetUser = user || 'current user';
      
      // Get current status first
      const statusResult = await this.ludusCliWrapper!.getRangeStatus(user);
      let currentStatus = 'unknown';
      if (statusResult.success && statusResult.data) {
        currentStatus = typeof statusResult.data === 'object' ? 
          (statusResult.data.status || 'active') : 'active';
      }

      // Destroy the range
      const result = await this.ludusCliWrapper!.destroyRange(user, force);
      
      if (!result.success) {
        throw new Error(`Failed to stop range: ${result.message}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `Range successfully stopped for ${targetUser}\n\n` +
                  `Previous Status: ${currentStatus}\n` +
                  `Result: ${JSON.stringify(result.data, null, 2)}\n\n` +
                  `Important: Range has been permanently destroyed\n` +
                  `- All VMs and data have been removed\n` +
                  `- Resources have been freed for new deployments\n\n` +
                  `Next Steps:\n` +
                  `- Deploy a new range: deploy_range()\n` +
                  `- Check available templates if needed\n` +
                  `- All previous data is permanently deleted`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to stop range: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the user has an active range to stop\n` +
                  `- Check admin permissions (if stopping other users' ranges)\n` +
                  `- Try: get_range_status() to check current status\n` +
                  `- Use force=true if there are confirmation prompts`
          }
        ]
      };
    }
  }

  private async handleRangeAbort(args: any) {
    const { user } = args;
    
    this.logger.info('Aborting range deployment', { user });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      const result = await this.ludusCliWrapper.abortRange(user);
      
      if (!result.success) {
        throw new Error(`Failed to abort range deployment: ${result.message}`);
      }

      const targetUser = user || 'current user';
      
      return {
        content: [
          {
            type: 'text',
            text: `Range deployment aborted successfully for ${targetUser}\n\n` +
                  `Deployment Process Killed:\n` +
                  `- Ansible deployment process terminated\n` +
                  `- All pending deployment tasks stopped\n` +
                  `- VMs may be in partial deployment state\n\n` +
                  `Next Steps:\n` +
                  `- Check range status: get_range_status()\n` +
                  `- Deploy again if needed: deploy_range()\n` +
                  `- View logs for issues: range_logs()`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to abort range deployment: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify there is an active deployment to abort\n` +
                  `- Check admin permissions (if aborting other users' deployments)\n` +
                  `- Try: get_range_status() to check current status\n` +
                  `- Check deployment logs for more details`
          }
        ]
      };
    }
  }

  private async handleGetTags(args: any) {
    const { user } = args;
    
    this.logger.info('Getting available deployment tags', { user });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      const result = await this.ludusCliWrapper.getTags(user);
      
      if (!result.success) {
        throw new Error(`Failed to get deployment tags: ${result.message}`);
      }

      const targetUser = user || 'current user';
      
      return {
        content: [
          {
            type: 'text',
            text: `Available Deployment Tags for ${targetUser}\n\n` +
                  `${JSON.stringify(result.data, null, 2)}\n\n` +
                  `Usage with deploy_range:\n` +
                  `- Use single tag: deploy_range({ tags: "dns" })\n` +
                  `- Use multiple tags: deploy_range({ tags: "dns,custom-groups" })\n` +
                  `- Example: deploy_range({ tags: "dns,custom-groups,baseline" })\n\n` +
                  `Common Tags:\n` +
                  `- baseline: Basic system configuration\n` +
                  `- dns: DNS server setup\n` +
                  `- custom-groups: User/group configuration\n` +
                  `- testing: Enable testing mode features`
          }
        ]
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get deployment tags: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify you have a configured range\n` +
                  `- Check admin permissions (if getting tags for other users)\n` +
                  `- Try: get_range_status() to check range configuration\n` +
                  `- Ensure range configuration is valid`
          }
        ]
      };
    }
  }

  private async handleLudusCliExecute(args: any) {
    const { command, args: cmdArgs = [], user } = args;
    
    const fullCommand = `ludus ${command} ${cmdArgs.join(' ')}`.trim();

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      // Parse command and arguments
      let parsedCommand = command;
      let parsedArgs = [...cmdArgs];

      // If command contains spaces, split it
      if (command.includes(' ')) {
        const parts = command.split(' ');
        parsedCommand = parts[0];
        parsedArgs = [...parts.slice(1), ...cmdArgs];
      }

      // Add user flag if provided
      if (user) {
        parsedArgs.push('--user', user);
      }

      // Execute the command
      const result = await this.ludusCliWrapper.executeArbitraryCommand(parsedCommand, parsedArgs);

      // Format the response
      const targetUser = user || 'current user';
      const status = result.success ? '' : '';
      
      return {
        content: [
          {
            type: 'text',
            text: `${status} Ludus CLI Command: \`${fullCommand}\`\n` +
                  `👤 User: ${targetUser}\n` +
                  `Status: ${result.success ? 'SUCCESS' : 'FAILED'}\n\n` +
                  `Output:\n` +
                  `\`\`\`\n${result.rawOutput || result.message}\n\`\`\`\n\n` +
                  `Use this output to:\n` +
                  `- Learn about available commands and their syntax\n` +
                  `- Execute complex operations not covered by specific tools\n` +
                  `- Troubleshoot issues with raw CLI access\n` +
                  `- Discover new features and capabilities`
          }
        ]
      };

    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute Ludus CLI command: \`${fullCommand}\`\n\n` +
                  `Error Details:\n` +
                  `\`\`\`\n${error.message}\n\`\`\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the command syntax with: ludus_cli_execute({ command: "help" })\n` +
                  `- Check if you have the necessary permissions\n` +
                  `- Ensure the server is properly configured\n` +
                  `- Try simpler commands first to test connectivity`
          }
        ]
      };
    }
  }

  private async handleLudusHelp(args: any) {
    const { command, subcommand, user } = args;
    
    // Log the help request
    const fullCommand = command && subcommand 
      ? `ludus ${command} ${subcommand} --help`
      : command 
        ? `ludus ${command} --help`
        : 'ludus help';
    
    this.logger.info('Getting Ludus CLI help', { command: fullCommand, user });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      // Build help command
      const helpArgs: string[] = [];

      if (command) {
        helpArgs.push(command);
        if (subcommand) {
          helpArgs.push(subcommand);
        }
        helpArgs.push('--help');
      }

      // Add user context if provided
      if (user) {
        helpArgs.push('--user', user);
      }

      // Execute help command
      let result;
      if (command) {
        // For specific commands: ludus <command> [subcommand] --help
        result = await this.ludusCliWrapper.executeArbitraryCommand(command, helpArgs);
      } else {
        // For general help: ludus --help  
        result = await this.ludusCliWrapper.executeCommand('--help', []);
      }

      if (!result.success) {
        throw new Error(`Failed to get help: ${result.message}`);
      }

      // Format response
      const targetUser = user || 'current user';
      const helpType = command && subcommand 
        ? `${command} ${subcommand}` 
        : command 
          ? command 
          : 'general';

      return {
        content: [
          {
            type: 'text',
            text: `Ludus CLI Help: ${helpType}\n` +
                  `👤 User: ${targetUser}\n` +
                  `Command: \`${fullCommand}\`\n\n` +
                  `\`\`\`\n${result.rawOutput || result.message}\n\`\`\`\n\n` +
                  `Related Tools:\n` +
                  `- Use ludus_cli_execute for running discovered commands\n` +
                  `- Use specific wrapper tools for common operations\n` +
                  `- Add --help to any wrapper tool for command-specific help`
          }
        ]
      };

    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get Ludus CLI help: ${error.message}\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the command exists with: ludus_help()\n` +
                  `- Check if you have the necessary permissions\n` +
                  `- Ensure the server is properly configured\n` +
                  `- Try: ludus_help({ command: "range" }) for specific help`
          }
        ]
      };
    }
  }

  private async handleListAllUsers(args: any) {
    this.logger.info('Listing all users');
    
    try {
      const result = await handleListAllUsers(args, this.logger, this.ludusCliWrapper!);

      return {
        content: [
          {
            type: 'text',
            text: result.success 
              ? `All Users Retrieved\n\n` +
                `**User Data:**\n` +
                `\`\`\`json\n${JSON.stringify(result.users, null, 2)}\n\`\`\`\n\n` +
                `**Usage Notes:**\n` +
                result.usage?.map((note: string) => `- ${note}`).join('\n') || ''
              : `Failed to list all users: ${result.message}\n\n` +
                `**Troubleshooting:**\n` +
                result.troubleshooting?.map((tip: string) => `- ${tip}`).join('\n') || ''
          }
        ]
      };
    } catch (error: any) {
      this.logger.error('Failed to list all users', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list all users: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Ensure you have admin privileges\n` +
                  `- Check if the Ludus server is accessible\n` +
                  `- Verify admin operations connectivity is working\n` +
                  `- Try: ludus_help({ command: "users", subcommand: "list" }) for more options`
          }
        ]
      };
    }
  }

  private async handleReadRangeConfig(args: any) {
    this.logger.info('Reading range configuration', { args });
    
    try {
      const result = await handleReadRangeConfig(args, this.logger);

      return {
        content: [
          {
            type: 'text',
            text: result.success 
              ? `Range Configuration Read Successfully\n\n` +
                `**Source:** ${result.source}\n` +
                `📏 **Content Length:** ${result.contentLength} characters\n\n` +
                `**Configuration Content:**\n` +
                `\`\`\`yaml\n${result.content}\n\`\`\`\n\n` +
                `**Next Steps:**\n` +
                `- Use validate_range_config to check schema compliance\n` +
                `- Use write_range_config to save modifications\n` +
                `- Use deploy_range to deploy this configuration`
              : `Failed to read configuration: ${result.message}\n\n` +
                `**Troubleshooting:**\n` +
                `- Verify the directory path exists (relative to ~/.ludus-mcp/range-config-templates/)\n` +
                `- Use relative paths only (e.g., "base-configs", "user1")\n` +
                `- Check directory permissions\n` +
                `- Ensure path points to a directory, not a file\n` +
                `- Make sure path is within allowed security boundaries`
          }
        ]
      };
    } catch (error: any) {
      this.logger.error('Failed to read range config', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read range configuration: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the file exists and is readable\n` +
                  `- Verify network connectivity for URLs\n` +
                  `- Ensure proper file permissions\n` +
                  `- Try using absolute file paths`
          }
        ]
      };
    }
  }

  private async handleWriteRangeConfig(args: any) {
    this.logger.info('Writing range configuration', { 
      filePath: args.filePath,
      contentLength: args.content?.length 
    });
    
    try {
      const result = await handleWriteRangeConfig(args, this.logger);

      return {
        content: [
          {
            type: 'text',
            text: result.success 
              ? `Range Configuration Saved Successfully\n\n` +
                `**File Path:** ${result.filePath}\n` +
                `📏 **Content Length:** ${result.contentLength} characters\n` +
                `**Schema Validation:** ${result.validation.valid ? 'PASSED' : 'FAILED'}\n` +
                (result.validation.warnings.length > 0 ? 
                  `**Warnings:** ${result.validation.warnings.length}\n` +
                  result.validation.warnings.map((w: string) => `- ${w}`).join('\n') + '\n'
                  : '') +
                `\n**Next Steps:**\n` +
                `- Configuration is ready for deployment\n` +
                `- Use deploy_range to deploy this configuration\n` +
                `- Use read_range_config to review the saved file`
              : `Failed to write configuration: ${result.message}\n\n` +
                (result.validation ? 
                  `**Validation Errors:**\n` +
                  result.validation.errors.map((e: string) => `- ${e}`).join('\n') + '\n\n'
                  : '') +
                `**Troubleshooting:**\n` +
                `- Fix schema validation errors above\n` +
                `- Check YAML syntax is valid\n` +
                `- Ensure directory permissions for file path\n` +
                `- Use validate_range_config to check config first`
          }
        ]
      };
    } catch (error: any) {
      this.logger.error('Failed to write range config', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to write range configuration: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check directory permissions\n` +
                  `- Ensure valid YAML syntax\n` +
                  `- Verify file path is writable\n` +
                  `- Use validate_range_config first to check schema`
          }
        ]
      };
    }
  }

  private async handleValidateRangeConfig(args: any) {
    this.logger.info('Validating range configuration', { args });
    
    try {
      const result = await handleValidateRangeConfig(args, this.logger);

      return {
        content: [
          {
            type: 'text',
            text: result.success 
              ? `Range Configuration Validation Results\n\n` +
                `**Source:** ${result.source}\n` +
                `**Valid:** ${result.validation.valid ? 'YES' : 'NO'}\n` +
                `**Errors:** ${result.validation.errors.length}\n` +
                `**Warnings:** ${result.validation.warnings.length}\n\n` +
                (result.validation.errors.length > 0 ? 
                  `**Validation Errors:**\n` +
                  result.validation.errors.map((e: string) => `- ${e}`).join('\n') + '\n\n'
                  : '') +
                (result.validation.warnings.length > 0 ? 
                  `**Warnings:**\n` +
                  result.validation.warnings.map((w: string) => `- ${w}`).join('\n') + '\n\n'
                  : '') +
                `**Next Steps:**\n` +
                (result.validation.valid ? 
                  `- Configuration is valid and ready for deployment\n` +
                  `- Use deploy_range to deploy this configuration\n` +
                  `- Use write_range_config to save any modifications`
                  : `- Fix the validation errors above\n` +
                  `- Use write_range_config to save corrected version\n` +
                  `- Re-validate before deployment`)
              : `Failed to validate configuration: ${result.message}\n\n` +
                `**Troubleshooting:**\n` +
                `- Check if the source file/URL is accessible\n` +
                `- Use relative paths only (e.g., "base-configs/file.yml", "user1/config.yaml")\n` +
                `- Verify YAML syntax is correct\n` +
                `- Ensure proper file permissions`
          }
        ]
      };
    } catch (error: any) {
      this.logger.error('Failed to validate range config', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to validate range configuration: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the file exists and is readable\n` +
                  `- Verify network connectivity for URLs\n` +
                  `- Ensure valid YAML syntax\n` +
                  `- Try using absolute file paths`
          }
        ]
      };
    }
  }

  private async handleListRangeConfigs(args: any) {
    this.logger.info('Listing range configurations', { directory: args.directory });
    
    try {
      const result = await handleListRangeConfigs(args, this.logger);

      return {
        content: [
          {
            type: 'text',
            text: result.success 
              ? (result.smartSearch 
                  ? `Smart Search Results\n\n` +
                    `**Summary:**\n` +
                    `- Total configs found: ${result.totalCount}\n` +
                    `- Valid configs: ${result.validCount}\n` +
                    `- Invalid configs: ${result.totalCount - result.validCount}\n\n` +
                    `**Search Results:**\n` +
                    result.searchResults.map((sr: any) => 
                      sr.found 
                        ? `${sr.directory} - Found ${sr.count} config${sr.count === 1 ? '' : 's'}`
                        : `${sr.directory} - ${sr.reason}`
                    ).join('\n') + '\n\n' +
                    (result.configs.length > 0 ? 
                      `**Configuration Files:**\n` +
                      result.configs.map((config: any) => 
                        `${config.status} **${config.relativePath}** (${config.sizeKB}) - ${config.statusMessage}\n` +
                        `   Full Path: ${config.filePath}\n` +
                        (config.validation.errors.length > 0 ? 
                          `   Errors: ${config.validation.errors.slice(0, 2).join(', ')}${config.validation.errors.length > 2 ? '...' : ''}\n`
                          : '') +
                        (config.validation.warnings.length > 0 ? 
                          `   Warnings: ${config.validation.warnings.slice(0, 2).join(', ')}${config.validation.warnings.length > 2 ? '...' : ''}\n`
                          : '')
                      ).join('\n') + '\n\n'
                      : '') +
                    `**Next Steps:**\n` +
                    `- Use read_range_config with file path to examine specific configs\n` +
                    `- Use validate_range_config to see detailed validation results\n` +
                    `- Use write_range_config to fix invalid configurations\n` +
                    `- Use deploy_range to deploy valid configurations` +
                    (result.message ? `\n\n${result.message}` : '')
                  : `Range Configurations in ${result.directory}\n\n` +
                    `**Summary:**\n` +
                    `- Total configs: ${result.totalCount}\n` +
                    `- Valid configs: ${result.validCount}\n` +
                    `- Invalid configs: ${result.totalCount - result.validCount}\n\n` +
                    (result.configs.length > 0 ? 
                      `**Configuration Files:**\n` +
                      result.configs.map((config: any) => 
                        `${config.status} **${config.relativePath}** (${config.sizeKB}) - ${config.statusMessage}\n` +
                        `   Full Path: ${config.filePath}\n` +
                        (config.validation.errors.length > 0 ? 
                          `   Errors: ${config.validation.errors.slice(0, 2).join(', ')}${config.validation.errors.length > 2 ? '...' : ''}\n`
                          : '') +
                        (config.validation.warnings.length > 0 ? 
                          `   Warnings: ${config.validation.warnings.slice(0, 2).join(', ')}${config.validation.warnings.length > 2 ? '...' : ''}\n`
                          : '')
                      ).join('\n') + '\n\n'
                      : '') +
                    `**Next Steps:**\n` +
                    `- Use read_range_config with file path to examine specific configs\n` +
                    `- Use validate_range_config to see detailed validation results\n` +
                    `- Use write_range_config to fix invalid configurations\n` +
                    `- Use deploy_range to deploy valid configurations` +
                    (result.message ? `\n\n${result.message}` : ''))
              : `Failed to list configurations: ${result.message}\n\n` +
                (result.allowedPaths ? 
                  `**Security Notice:** Directory access is restricted to:\n` +
                  result.allowedPaths.map((p: string) => `- ${p}`).join('\n') + '\n\n'
                  : '') +
                `**Troubleshooting:**\n` +
                `- Verify the directory path exists\n` +
                `- Check directory permissions\n` +
                `- Ensure path points to a directory, not a file\n` +
                `- Make sure path is within allowed security boundaries\n` +
                `- Try using absolute paths`
          }
        ]
      };
    } catch (error: any) {
      this.logger.error('Failed to list range configs', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list range configurations: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the directory exists and is readable\n` +
                  `- Verify directory permissions\n` +
                  `- Ensure proper file system access\n` +
                  `- Use relative paths only (e.g., "base-configs", "user1")\n` +
                  `- Omit directory parameter to search all templates automatically`
          }
        ]
      };
    }
  }

  private async handleGetRangeConfig(args: any) {
    this.logger.info('Getting range configuration', { args });
    
    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      const result = await handleGetRangeConfig(args, this.logger, this.ludusCliWrapper);
      
      if (result.success) {
        const configType = result.example ? 'Example Configuration' : `Range Configuration for ${result.user}`;
        return {
          content: [
            {
              type: 'text',
              text: `${configType} Retrieved Successfully\n\n` +
                    `**Configuration Content:**\n` +
                    `\`\`\`yaml\n${result.content}\n\`\`\`\n\n` +
                    ` **Next Steps:**\n` +
                    `- Use write_range_config to save modifications\n` +
                    `- Use validate_range_config to check schema compliance\n` +
                    `- Use set_range_config to apply this configuration\n` +
                    `- Use deploy_range to deploy this configuration`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get range configuration\n\n` +
                    `**Error Details:**\n` +
                    `\`\`\`\n${result.error}\n\`\`\`\n\n` +
                    `**Troubleshooting:**\n` +
                    `- Check if a range configuration exists\n` +
                    `- Verify user permissions\n` +
                    `- Try using get_range_config with example=true for a sample config\n` +
                    `- Use list_range_configs to see available templates`
            }
          ]
        };
      }
    } catch (error: any) {
      this.logger.error('Failed to get range config', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get range configuration: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify Ludus CLI connectivity\n` +
                  `- Check user permissions\n` +
                  `- Ensure the range is properly configured\n` +
                  `- Try using the example flag for sample configurations`
          }
        ]
      };
    }
  }

  private async handleSetRangeConfig(args: any) {
    this.logger.info('Setting range configuration', { args });
    
    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }
    
    try {
      const result = await handleSetRangeConfig(args, this.logger, this.ludusCliWrapper);
      return result;
    } catch (error: any) {
      this.logger.error('Failed to set range config', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to set range configuration: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the configuration file exists and is valid\n` +
                  `- Check Ludus CLI connectivity\n` +
                  `- Ensure proper user permissions\n` +
                  `- Try validating the config file first with validate_range_config`
          }
        ]
      };
    }
  }

  private async handleLudusPower(args: any) {
    this.logger.info('Executing power management command', { action: args.action, user: args.user });
    
    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }

    try {
      const result = await handleLudusPower(args, this.logger, this.ludusCliWrapper);
      
      if (result.success) {
        const actionEmoji = result.action === 'on' ? '🟢' : '🔴';
        const actionText = result.action === 'on' ? 'powered on' : 'powered off';
        
        let responseText = `${actionEmoji} Range VMs successfully ${actionText} for ${result.user}\n\n`;
        
        if (result.nextSteps && result.nextSteps.length > 0) {
          responseText += `Next Steps:\n`;
          result.nextSteps.forEach((step: string) => {
            responseText += `- ${step}\n`;
          });
        }
        
        return {
          content: [
            {
              type: 'text',
              text: responseText
            }
          ]
        };
      } else {
        if (result.confirmationRequired) {
          let confirmText = `${result.message}\n\n`;
          confirmText += `Reason: ${result.reason}\n\n`;
          confirmText += `To proceed:\n`;
          result.instructions.forEach((instruction: string) => {
            confirmText += `- ${instruction}\n`;
          });
          
          return {
            content: [
              {
                type: 'text',
                text: confirmText
              }
            ]
          };
        } else {
          throw new Error(result.message);
        }
      }
    } catch (error: any) {
      this.logger.error('Power management failed', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Power management failed: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the user has a deployed range\n` +
                  `- Check if you have admin permissions (if managing other users)\n` +
                  `- Ensure the range exists and is accessible\n` +
                  `- Try get_range_status() to check current range state\n` +
                  `- Use ludus_help() for more information`
          }
        ]
      };
    }
  }

  private async handleGetCredentialFromUser(args: any) {
    this.logger.info('Prompting user for credential entry', { credName: args.credName });

    try {
      const result = await handleGetCredentialFromUser(args, this.logger);
      
      if (result.success) {
        let responseText = `Credential "${result.credName}" stored securely\n\n`;
        responseText += `Location: ${result.location}\n\n`;
        
        if (result.nextSteps && result.nextSteps.length > 0) {
          responseText += `Next Steps:\n`;
          result.nextSteps.forEach((step: string) => {
            responseText += `- ${step}\n`;
          });
        }
        
        return {
          content: [
            {
              type: 'text',
              text: responseText
            }
          ]
        };
      } else {
        if (result.cancelled) {
          return {
            content: [
              {
                type: 'text',
                text: `Credential entry cancelled by user for "${result.credName}"\n\n` +
                      `You can try again when ready with the same command.`
              }
            ]
          };
        } else {
          throw new Error(result.message);
        }
      }
    } catch (error: any) {
      this.logger.error('Credential entry failed', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to store credential: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Ensure GUI access is available for popup dialogs\n` +
                  `- Check credential name follows LudusCredName-<TargetUser>-<CredName> format\n` +
                  `- Verify OS credential manager is functional\n` +
                  `- Try get_credential_from_user({ help: true }) for more information`
          }
        ]
      };
    }
  }

  private async handleInsertCredsRangeConfig(args: any) {
    this.logger.info('Processing credential injection for range config', { 
      configPath: args.configPath,
      credentialCount: args.credentialMappings ? Object.keys(args.credentialMappings).length : 0
    });

    try {
      const result = await handleInsertCredsRangeConfig(args, this.logger);
      
      if (result.success) {
        let responseText = `Credential injection completed successfully\n\n`;
        responseText += `Config Path: ${result.configPath}\n`;
        responseText += `Credentials Injected: ${result.credentialsInjected}\n`;
        responseText += `Validation: ${result.validation.valid ? 'PASSED' : 'FAILED'}\n\n`;
        
        if (result.validation.warnings && result.validation.warnings.length > 0) {
          responseText += ` Schema Warnings:\n`;
          result.validation.warnings.forEach((warning: string) => {
            responseText += `- ${warning}\n`;
          });
          responseText += `\n`;
        }
        
        if (result.outputPath) {
          responseText += `Saved to: ${result.outputPath}\n\n`;
        }
        
        responseText += `Security Note: ${result.securityNote}\n\n`;
        
        if (result.nextSteps && result.nextSteps.length > 0) {
          responseText += `Next Steps:\n`;
          result.nextSteps.forEach((step: string) => {
            responseText += `- ${step}\n`;
          });
        }
        
        return {
          content: [
            {
              type: 'text',
              text: responseText
            }
          ]
        };
      } else {
        let errorText = `Credential injection failed: ${result.message}\n\n`;
        
        if (result.missingCredentials && result.missingCredentials.length > 0) {
          errorText += `Missing Credentials:\n`;
          result.missingCredentials.forEach((cred: string) => {
            errorText += `- ${cred}\n`;
          });
          errorText += `\n`;
        }
        
        if (result.errors && result.errors.length > 0) {
          errorText += ` Errors:\n`;
          result.errors.forEach((error: string) => {
            errorText += `- ${error}\n`;
          });
          errorText += `\n`;
        }
        
        if (result.suggestions && result.suggestions.length > 0) {
          errorText += ` Suggestions:\n`;
          result.suggestions.forEach((suggestion: string) => {
            errorText += `- ${suggestion}\n`;
          });
        }
        
        return {
          content: [
            {
              type: 'text',
              text: errorText
            }
          ]
        };
      }
    } catch (error: any) {
      this.logger.error('Credential injection failed', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to inject credentials: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify config file path exists using list_range_configs\n` +
                  `- Check credential names match stored credentials exactly\n` +
                  `- Ensure credential mappings match placeholders in config file\n` +
                  `- Verify OS credential manager access is working`
          }
        ]
      };
    }
  }



  private async handleLudusDocsSearch(args: any) {
    this.logger.info('Searching Ludus documentation', { action: args.action, query: args.search_query });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }

    try {
      return await handleLudusDocsSearch(args, this.logger, this.ludusCliWrapper);
    } catch (error: any) {
      this.logger.error('Failed to search documentation', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to search documentation: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the action and parameters are valid\n` +
                  `- Ensure the documentation was downloaded during server startup\n` +
                  `- Try restarting the server to re-download documentation`
          }
        ]
      };
    }
  }

  private async handleLudusRangePlanner(args: any) {
    this.logger.info('Executing Ludus Range Planner', { args });

    try {
      const result = await handleLudusRangePlanner(args, this.logger);

      if (result.success) {
        let responseText = `**Range Planning Completed Successfully**\n\n`;
        responseText += `**Plan Details:**\n`;
        responseText += `• Plan ID: ${result.plan_id}\n`;
        responseText += `• Estimated VMs: ${result.estimated_vms}\n\n`;
        responseText += `${result.message}\n\n`;
        
        responseText += ` **Structured Instructions:**\n`;
        responseText += `Follow these steps using your existing MCP tools:\n\n`;
        
        responseText += `**Research Phase:**\n`;
        responseText += `1. ${result.instructions.research_phase.step1_analyze_intent.description}\n`;
        responseText += `2. ${result.instructions.research_phase.step2_clarify_requirements.description}\n`;
        responseText += `3. ${result.instructions.research_phase.step3_research_components.description}\n`;
        responseText += `4. ${result.instructions.research_phase.step4_handle_missing_roles.description}\n`;
        
        if (result.instructions.research_phase.step5_validate_role_variables) {
          responseText += `5. ${result.instructions.research_phase.step5_validate_role_variables.description}\n\n`;
        }
        
        responseText += `**Design Phase:**\n`;
        responseText += `6. ${result.instructions.design_phase.step6_design_architecture.description}\n`;
        responseText += `7. ${result.instructions.design_phase.step7_generate_config.description}\n`;
        responseText += `8. ${result.instructions.design_phase.step8_qa_check_against_plan.description}\n\n`;
        
        responseText += `**Validation Phase:**\n`;
        responseText += `9. ${result.instructions.validation_phase.step9_validate_config.description}\n`;
        responseText += `10. ${result.instructions.validation_phase.step10_save_and_document.description}\n\n`;
        
        responseText += `**Remember:** Use validate_range_config with content parameter before writing files!`;
        
        return {
          content: [
            {
              type: 'text',
              text: responseText
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Range planning failed: ${result.message}\n\n` +
                    `Please check your input parameters and try again.`
            }
          ]
        };
      }
    } catch (error: any) {
      this.logger.error('Ludus Range Planner failed', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute Ludus Range Planner: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check the user_intent parameter is provided\n` +
                  `- Verify all optional parameters are valid\n` +
                  `- Try ludus_help() for more information on usage`
          }
        ]
      };
    }
  }

  private async handleLudusRolesDocsRead(args: any) {
    this.logger.info('Reading Ludus roles docs');

    try {
      return await handleLudusRolesDocsRead(args);
    } catch (error: any) {
      this.logger.error('Failed to read roles docs', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read roles docs: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the action and parameters are valid\n` +
                  `- Ensure the documentation was downloaded during server startup\n` +
                  `- Try restarting the server to re-download documentation`
          }
        ]
      };
    }
  }

  private async handleLudusEnvironmentGuidesSearch(args: any) {
    this.logger.info('Searching Ludus environment guides', { action: args.action, query: args.search_query });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }

    try {
      return await handleLudusEnvironmentGuidesSearch(args, this.logger, this.ludusCliWrapper);
    } catch (error: any) {
      this.logger.error('Failed to search environment guides', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to search environment guides: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the action and parameters are valid\n` +
                  `- Ensure the documentation was downloaded during server startup\n` +
                  `- Try restarting the server to re-download documentation`
          }
        ]
      };
    }
  }

  private async handleLudusNetworkingDocsRead(args: any) {
    this.logger.info('Searching Ludus networking docs', { action: args.action, query: args.search_query });

    try {
      return await handleLudusNetworkingDocsRead(args);
    } catch (error: any) {
      this.logger.error('Failed to read networking docs', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read networking docs: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the action and parameters are valid\n` +
                  `- Ensure the documentation was downloaded during server startup\n` +
                  `- Try restarting the server to re-download documentation`
          }
        ]
      };
    }
  }

  private async handleLudusReadRangeConfigSchema(args: any) {
    this.logger.info('Reading range configuration schema', { args });
    
    try {
      return await handleLudusReadRangeConfigSchema(args);
    } catch (error: any) {
      this.logger.error('Failed to read range configuration schema', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read range configuration schema: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if the file exists and is readable\n` +
                  `- Verify network connectivity for URLs\n` +
                  `- Ensure proper file permissions\n` +
                  `- Try using absolute file paths`
          }
        ]
      };
    }
  }

  private async handleLudusRangeConfigCheckAgainstPlan(args: any) {
    this.logger.info('Range config QA check requested', { user_requirements: args.user_requirements?.substring(0, 100) });

    if (!this.ludusCliWrapper) {
      return {
        content: [
          {
            type: 'text',
            text: `Server not fully initialized yet. Please wait a moment and try again.\n\n` +
                  `The server is still setting up connections and validating credentials.\n` +
                  `This usually takes 10-30 seconds after startup.`
          }
        ]
      };
    }

    try {
      return await handleLudusRangeConfigCheckAgainstPlan(args, this.logger, this.ludusCliWrapper);
    } catch (error: any) {
      this.logger.error('Failed to run QA check', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to run QA check: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Check if all required parameters are provided\n` +
                  `- Ensure user_requirements, config_content, and roles_used are specified`
          }
        ]
      };
    }
  }

  private async handleLudusReadRoleCollectionSchema(args: any) {
    this.logger.info('Reading role collection schema', { args });
    
    try {
      return await handleLudusReadRoleCollectionSchema(args);
    } catch (error: any) {
      this.logger.error('Failed to read role schema', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read role collection schema: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Restart the MCP server to reinitialize the schema\n` +
                  `- Check file system permissions\n` +
                  `- Verify the schema file was created during server startup`
          }
        ]
      };
    }
  }

  private async handleLudusListRoleCollectionSchemas(args: any) {
    this.logger.info('Listing role collection schemas', { args });
    
    try {
      return await handleLudusListRoleCollectionSchemas(args, this.logger);
    } catch (error: any) {
      this.logger.error('Failed to list role collection schemas', { error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list role collection schemas: \`${error.message}\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Restart the MCP server to download schemas from GitHub\n` +
                  `- Check internet connection for GitHub access\n` +
                  `- Verify ~/.ludus-mcp/schemas/ directory exists\n` +
                  `- Ensure the 'yaml-schemas' branch is available`
          }
        ]
      };
    }
  }

  private setupErrorHandlers(): void {
    this.server.onerror = (error) => {
      this.logger.error('Server error', { error });
    };

    process.on('SIGINT', async () => {
      this.logger.info('Received SIGINT, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('Received SIGTERM, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });
  }

  /**
   * Load configuration from keyring first, then environment variables
   */
  private async loadConfigFromAvailableSources(): Promise<LudusConfig | null> {
    // Try keyring first if available
    if (isKeyringSupportAvailable()) {
      try {
        const credentials = await getCredentials([
          CREDENTIAL_KEYS.ADMIN_USER,
          CREDENTIAL_KEYS.CONNECTION_METHOD,
          CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH,
          CREDENTIAL_KEYS.API_KEY,
          CREDENTIAL_KEYS.SSH_HOST,
          CREDENTIAL_KEYS.SSH_USER,
                CREDENTIAL_KEYS.SSH_AUTH_METHOD,
      CREDENTIAL_KEYS.SSH_PASSWORD,
      CREDENTIAL_KEYS.SSH_KEY_PATH,
      CREDENTIAL_KEYS.SSH_KEY_PASSPHRASE
        ]);

        const connectionMethod = (credentials[CREDENTIAL_KEYS.CONNECTION_METHOD] as 'wireguard' | 'ssh-tunnel') || 'wireguard';
        const sshAuthMethod = (credentials[CREDENTIAL_KEYS.SSH_AUTH_METHOD] as 'password' | 'key') || 'password';
        const baseUrl = connectionMethod === 'ssh-tunnel' ? 'https://localhost:8080' : 'https://198.51.100.1:8080';

        // Check if we have all required credentials from keyring
        const hasBaseCredentials = 
          credentials[CREDENTIAL_KEYS.ADMIN_USER] &&
          credentials[CREDENTIAL_KEYS.CONNECTION_METHOD] &&
          credentials[CREDENTIAL_KEYS.API_KEY] &&
          credentials[CREDENTIAL_KEYS.SSH_HOST] &&
          credentials[CREDENTIAL_KEYS.SSH_USER] &&
          credentials[CREDENTIAL_KEYS.SSH_AUTH_METHOD];

        const hasWireguardConfig = connectionMethod === 'ssh-tunnel' || credentials[CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH];
        const hasSshAuth = (sshAuthMethod === 'password' && !!credentials[CREDENTIAL_KEYS.SSH_PASSWORD]) ||
                           (sshAuthMethod !== 'password' && !!credentials[CREDENTIAL_KEYS.SSH_KEY_PATH]);

        if (hasBaseCredentials && hasWireguardConfig && hasSshAuth) {
          this.logger.info('Using configuration from keyring');
          return {
                  adminUser: credentials[CREDENTIAL_KEYS.ADMIN_USER]!,
      connectionMethod,
      wireguardConfig: credentials[CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH] || undefined,
      apiKey: credentials[CREDENTIAL_KEYS.API_KEY]!,
      sshHost: credentials[CREDENTIAL_KEYS.SSH_HOST]!,
      sshUser: credentials[CREDENTIAL_KEYS.SSH_USER]!,
      sshAuthMethod,
      sshPassword: credentials[CREDENTIAL_KEYS.SSH_PASSWORD] || undefined,
      sshKeyPath: credentials[CREDENTIAL_KEYS.SSH_KEY_PATH] || undefined,
      sshKeyPassphrase: credentials[CREDENTIAL_KEYS.SSH_KEY_PASSPHRASE] || undefined,
            ludusUrl: process.env.LUDUS_URL || baseUrl,
            verifySSL: process.env.LUDUS_VERIFY === 'true'
          };
        } else {
          this.logger.warn('Keyring credentials incomplete');
        }
      } catch (error: any) {
        this.logger.debug('Failed to load credentials from keyring', { error: error.message });
      }
    }

    // Fall back to environment variables
    const envVars = {
      adminUser: process.env.LUDUS_ADMIN_USER,
      connectionMethod: process.env.LUDUS_CONNECTION_METHOD,
      wireguardConfig: process.env.LUDUS_WIREGUARD_CONFIG,
      apiKey: process.env.LUDUS_API_KEY,
      sshHost: process.env.LUDUS_SSH_HOST,
      sshUser: process.env.LUDUS_SSH_USER,
      sshAuthMethod: process.env.LUDUS_SSH_AUTH_METHOD,
      sshPassword: process.env.LUDUS_SSH_PASSWORD,
      sshKeyPath: process.env.LUDUS_SSH_KEY_PATH
    };

    const connectionMethod = (envVars.connectionMethod as 'wireguard' | 'ssh-tunnel') || 'wireguard';
    const sshAuthMethod = (envVars.sshAuthMethod as 'password' | 'key') || 'password';
    const hasBaseEnvVars = envVars.adminUser && envVars.apiKey && envVars.sshHost && envVars.sshUser && envVars.sshAuthMethod;
    const hasWireguardConfig = connectionMethod === 'ssh-tunnel' || envVars.wireguardConfig;
    const hasSshAuth = (sshAuthMethod === 'password' && envVars.sshPassword) || 
                       (sshAuthMethod !== 'password' && envVars.sshKeyPath);

    if (hasBaseEnvVars && hasWireguardConfig && hasSshAuth) {
      this.logger.info('Using configuration from environment variables');
      const baseUrl = connectionMethod === 'ssh-tunnel' ? 'https://localhost:8080' : 'https://198.51.100.1:8080';
      
      return {
        adminUser: envVars.adminUser!,
        connectionMethod,
        wireguardConfig: envVars.wireguardConfig || undefined,
        apiKey: envVars.apiKey!,
        sshHost: envVars.sshHost!,
        sshUser: envVars.sshUser!,
        sshAuthMethod,
        sshPassword: envVars.sshPassword || undefined,
        sshKeyPath: envVars.sshKeyPath || undefined,
        ludusUrl: process.env.LUDUS_URL || baseUrl,
        verifySSL: process.env.LUDUS_VERIFY === 'true'
      };
    }

    return null;
  }

  private async initializeServer(): Promise<void> {
    this.logger.info('Initializing Ludus MCP Server');

    // For MCP server, only try to load existing configuration - never run interactive setup
    // Interactive setup should only be run via --setup-keyring flag
    this.ludusConfig = await this.loadConfigFromAvailableSources();
    
    if (!this.ludusConfig) {
      throw new Error('No configuration available. Please run: npx ludus-mcp --setup-keyring');
    }



    // Download Ludus documentation
    try {
      await downloadLudusDocumentation(this.logger);
    } catch (error) {
      this.logger.warn('Failed to download Ludus documentation', { error: error instanceof Error ? error.message : String(error) });
    }

    // Initialize base configurations (download from GitHub)
    try {
      await downloadBaseConfigs(this.logger);
    } catch (error) {
      // Don't fail startup if base configs download fails - just log it
      this.logger.warn('Base configs download failed', { error: error instanceof Error ? error.message : String(error) });
    }

    // Download fresh schemas (GitHub + docs.ludus.cloud)
    try {
      await downloadSchemas(this.logger);
    } catch (error) {
      // Don't fail startup if schema download fails - just log it
      this.logger.warn('Schema download failed', { error: error instanceof Error ? error.message : String(error) });
    }

    // Initialize CLI wrapper with configuration
    this.ludusCliWrapper = new LudusCliWrapper(this.logger, this.ludusConfig);

    // Wait for SSH tunnels to be established if needed
    if (this.ludusConfig.connectionMethod === 'ssh-tunnel') {
      this.logger.info('Waiting for SSH tunnels to establish...');
      // Give tunnels time to establish before testing connectivity
      await new Promise(resolve => setTimeout(resolve, 8000));
    }

    // Test connectivity
    this.logger.info('Testing connectivity...');
    const connectivity = await this.ludusCliWrapper.testConnectivity();
    
    if (!connectivity.rangeOps) {
      this.logger.error('Range operations connectivity test failed');
      throw new Error('Range operations connectivity is required but not available');
    }

    this.logger.info('Connectivity test results', { 
      rangeOps: connectivity.rangeOps,
      adminOps: connectivity.adminOps 
    });

    if (!connectivity.adminOps) {
      this.logger.warn('Admin operations connectivity not available - user management will be limited');
    }

    this.logger.info('Ludus MCP Server initialized successfully');
    console.error('Ludus MCP Server running with 27 tools available');
    console.error('Range Management: deploy_range, get_range_status, list_user_ranges, get_connection_info, destroy_range, range_abort, ludus_power');
    console.error('Configuration Tools: read_range_config, write_range_config, validate_range_config, list_range_configs, get_range_config, set_range_config');
    console.error('Utility Tools: get_tags, ludus_cli_execute, ludus_help, list_all_users, get_credential_from_user, insert_creds_range_config, ludus_docs_search');
    console.error('Search & Planning: ludus_range_planner, ludus_roles_search, ludus_environment_guides_search, ludus_networking_search, ludus_read_range_config_schema, ludus_range_config_check_against_plan, ludus_read_role_collection_schema');
    console.error('Base configs synced: ~/.ludus-mcp/range-config-templates/base-configs/ (from GitHub)');
    console.error('Schemas synced: ~/.ludus-mcp/schemas/ (GitHub + docs.ludus.cloud)');
    console.error('Documentation cached: ~/.ludus-mcp/ludus-docs/');
  }

  private async shutdown(): Promise<void> {
    this.logger.info('Shutting down Ludus MCP Server');
    
    if (this.ludusCliWrapper) {
      await this.ludusCliWrapper.cleanup();
    }

    await this.server.close();
    this.logger.info('Server shutdown complete');
  }

    async start(): Promise<void> {
    try {
      // Connect MCP transport first so we can respond to protocol messages
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      // Then try to initialize - if this fails, we can still respond to MCP requests
      try {
        await this.initializeServer();
        this.logger.info('Ludus MCP Server started successfully');
      } catch (initError: any) {
        this.logger.error('Server initialization failed, but MCP transport is connected', initError);
        // Don't exit - let the server respond to MCP requests with initialization errors
      }
    } catch (error: any) {
                             this.logger.error('Failed to start MCP transport', error);
      console.error(`\nFailed to start Ludus MCP Server: ${error.message}`);
      process.exit(1);
    }
  }

  private setupPromptHandlers(): void {
    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: ALL_PROMPTS
      };
    });

    // Get specific prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params.name;
      
      if (promptName === 'create-ludus-range') {
        return await handleCreateLudusRangePrompt(request.params.arguments as any || {});
      }
      
      if (promptName === 'execute-ludus-cmd') {
        return await handleExecuteLudusCmdPrompt(request.params.arguments as any || {});
      }
      
      throw new Error(`Unknown prompt: ${promptName}`);
    });
  }
}

// Handle CLI arguments
async function handleCliArguments(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.includes('--setup-keyring') || args.includes('--renew-keyring')) {
    const isRenewal = args.includes('--renew-keyring');
    
    console.error(`\nLudus MCP Server - ${isRenewal ? 'Keyring Renewal' : 'Keyring Setup'}`);
    console.error('=====================================');
    console.error(`This will ${isRenewal ? 'update your existing' : 'securely store your'} Ludus credentials in the OS keyring.\n`);
    
    const logger = new Logger(isRenewal ? 'KeyringRenewal' : 'KeyringSetup');
    const setup = new InteractiveSetup(logger);
    
    try {
      const result = await setup.runSetup(isRenewal); // Force interactive if renewing
      
      if (result.success) {
        console.error(`\nCredentials successfully ${isRenewal ? 'updated in' : 'stored in'} keyring!`);
        console.error('Your credentials are now encrypted and stored securely.');
        console.error('You can now start the MCP server without prompting:\n');
        console.error('   npx ludus-mcp');
        
        // Add WireGuard guidance if using WireGuard connection method
        if (result.config && result.config.connectionMethod === 'wireguard') {
          console.error('\n  IMPORTANT: WireGuard Usage');
          console.error('   • Manually start your WireGuard tunnel before launching Claude Desktop');
          console.error('   • For automatic startup, configure WireGuard as a Windows service');
          console.error('   • If WireGuard is down, the MCP client will try SSH tunnel fallback');
        }
        
        // Determine the path to the built server.js file
        const serverJsPath = path.resolve(process.cwd(), 'dist', 'server.js').replace(/\\/g, '/');
        
        console.error('\nClaude Desktop configuration:');
        console.error('   Add this to your ~/.claude_desktop_config.json:');
        console.error('   {');
        console.error('     "mcpServers": {');
        console.error('       "ludus": {');
        console.error('         "command": "node",');
        console.error(`         "args": ["${serverJsPath}"]`);
        console.error('       }');
        console.error('     },');
        console.error('     "isUsingBuiltInNodeForMcp": false');
        console.error('   }');
        console.error('');
        console.error(' Note: The API key is still managed by the Ludus CLI.');
        console.error('         Make sure to run: ludus apikey');
      } else {
        console.error(`\n Setup failed: ${result.message}`);
        process.exit(1);
      }
    } catch (error: any) {
      console.error(`\n Setup error: ${error.message}`);
      process.exit(1);
    }
    
    process.exit(0);
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    console.error('\n Ludus MCP Server');
    console.error('===================');
    console.error('Secure MCP server for Ludus cybersecurity training environments.\n');
    console.error('Usage:');
    console.error('  npx ludus-mcp                 Start the MCP server');
    console.error('  npx ludus-mcp --setup-keyring Set up secure credential storage');
    console.error('  npx ludus-mcp --renew-keyring Update existing credentials in keyring');
    console.error('  npx ludus-mcp --help          Show this help message\n');
    console.error('Features:');
    console.error('  • Secure credential storage using OS keyring');
    console.error('  • WireGuard VPN connectivity');
    console.error('  • SSH tunnel management for admin operations');
    console.error('  • 10 core tools for range management + help + general CLI access\n');
    console.error('For more information, visit: https://github.com/badsectorlabs/ludus');
    process.exit(0);
  }
}

// Handle CLI arguments first
handleCliArguments().then(() => {
  // Start the server
  const server = new LudusMCPServer();
  server.start().catch((error) => {
    console.error('Fatal error starting server:', error);
    process.exit(1);
  });
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 