import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function createSetRangeConfigTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'set_range_config',
    description: `Set a range configuration in Ludus using an existing configuration file.

**WORKING DIRECTORY**: All file paths are relative to ~/.ludus-mcp/range-config-templates/

**PATH USAGE**: 
- Use relative paths only: "base-configs/acme.yml", "user1/config.yaml", "mp/settings.yml"
- DO NOT use: "~/.ludus-mcp/...", "/absolute/paths", or "../traversal"

**EXAMPLES**:
- file: "base-configs/acme.yml" → sets from ~/.ludus-mcp/range-config-templates/base-configs/acme.yml
- file: "user1/config.yaml" → sets from ~/.ludus-mcp/range-config-templates/user1/config.yaml

CRITICAL LLM BEHAVIOR: CREDENTIAL REDACTION REQUIRED 
When displaying configuration content in conversation, you MUST replace any non-range-specific credentials such as API keys for external services, passwords not specific to the cyber range environment, or similar credentials with "REDACTED-CREDENTIAL" to prevent credential exposure in chat logs.

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- CHECK EXISTING STATE: Use list_user_ranges or get_range_status before major operations
- ADMIN vs USER: Admin operations (--user flag) affect other users' ranges - be explicit
- Configuration changes overwrite existing settings - warn users about data loss
- Force flag should only be used when explicitly requested by the user
- REDACT credentials when showing config content to users

CRITICAL WORKFLOW REMINDER:
- This step SETS the active configuration - it's required before deployment
- deploy_range uses the currently SET config, not just any config file
- Always set_range_config first, then deploy_range
- Typical workflow: write_range_config → validate_range_config → set_range_config → deploy_range`,
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Relative file path (e.g., "base-configs/acme.yml") of the range configuration file. Must be within ~/.ludus-mcp/range-config-templates/',
        },
        user: {
          type: 'string',
          description: 'User ID to set the configuration for (admin only)',
        },
        force: {
          type: 'boolean',
          description: 'Force the configuration update even with testing enabled',
          default: false,
        },
        verbose: {
          type: 'boolean',
          description: 'Enable verbose output',
          default: false,
        },
      },
      required: ['file'],
    },
  };
}

export interface SetRangeConfigArgs {
  file: string;
  user?: string;
  force?: boolean;
  verbose?: boolean;
}

export async function handleSetRangeConfig(
  args: SetRangeConfigArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { file, user, force = false, verbose = false } = args;

  logger.info('Setting range configuration', { file, user, force, verbose });

  try {
    // Resolve the file path
    const homeDir = os.homedir();
    const configTemplatesDir = path.join(homeDir, '.ludus-mcp', 'range-config-templates');
    const resolvedFilePath = path.join(configTemplatesDir, file);

    // Ensure the base directory exists
    if (!fs.existsSync(configTemplatesDir)) {
      fs.mkdirSync(configTemplatesDir, { recursive: true });
      logger.warn('Created ~/.ludus-mcp/range-config-templates directory', { path: configTemplatesDir });
    }

    // Security validation: ensure the resolved path is within allowed boundaries
    const relativePath = path.relative(configTemplatesDir, resolvedFilePath);
    if (relativePath && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
      const errorMessage = `Access denied: file path '${file}' is outside allowed directory. Files must be within ~/.ludus-mcp/range-config-templates/`;
      logger.error('Security validation failed for file access', { 
        file, 
        resolvedFilePath, 
        relativePath,
        configTemplatesDir 
      });
      return {
        success: false,
        file: file,
        error: errorMessage,
        message: `Failed to set range configuration: ${errorMessage}`
      };
    }

    // Check if the file exists
    if (!fs.existsSync(resolvedFilePath)) {
      const errorMessage = `Configuration file not found: ${file}`;
      logger.error('Configuration file not found', { file, resolvedFilePath });
      return {
        success: false,
        file: file,
        error: errorMessage,
        message: `Failed to set range configuration: ${errorMessage}`
      };
    }

    // Build the command arguments
    const cmdArgs: string[] = ['config', 'set'];
    
    // Add file flag
    cmdArgs.push('-f', resolvedFilePath);
    
    // Add optional flags
    if (force) {
      cmdArgs.push('--force');
    }
    
    if (verbose) {
      cmdArgs.push('--verbose');
    }
    
    if (user) {
      cmdArgs.push('--user', user);
    }

    // Execute the command
    const result = await cliWrapper.executeCommand('range', cmdArgs);

    const targetUser = user || 'current user';
    
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `Range configuration set successfully for ${targetUser}\n\n` +
                  `Configuration file: ${file}\n` +
                  `${force ? ' Force mode was enabled\n' : ''}` +
                  `Output:\n` +
                  `\`\`\`\n${result.rawOutput || result.message}\n\`\`\`\n\n` +
                  `Next steps:\n` +
                  `- Use get_range_status to check current range state\n` +
                  `- Use deploy_range to deploy this configuration\n` +
                  `- Use list_user_ranges to see all configured ranges`
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to set range configuration for ${targetUser}\n\n` +
                  `Configuration file: ${file}\n` +
                  `Error Details:\n` +
                  `\`\`\`\n${result.rawOutput || result.message}\n\`\`\`\n\n` +
                  `Troubleshooting:\n` +
                  `- Verify the configuration file exists and is valid\n` +
                  `- Check file permissions and path accessibility\n` +
                  `- Use validate_range_config to check the file first\n` +
                  `- Try with --force flag if testing mode is preventing the update\n` +
                  `- Ensure you have permissions for the specified user`
          }
        ]
      };
    }

  } catch (error: any) {
    logger.error('Set range config failed', { file, user, error: error.message });
    
    return {
      content: [
        {
          type: 'text',
          text: `Error setting range configuration\n\n` +
                `File: ${file}\n` +
                `👤 User: ${user || 'current user'}\n` +
                `Error: ${error.message}\n\n` +
                `Troubleshooting:\n` +
                `- Verify Ludus CLI is properly configured\n` +
                `- Check network connectivity to Ludus server\n` +
                `- Ensure the configuration file path is correct\n` +
                `- Validate the config file format with validate_range_config`
        }
      ]
    };
  }
} 