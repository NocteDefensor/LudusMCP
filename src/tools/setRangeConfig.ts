import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export function createSetRangeConfigTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'set_range_config',
    description: `Set a range configuration in Ludus using an existing configuration file.

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
          description: 'Path to the range configuration file (required)',
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
    // Build the command arguments
    const cmdArgs: string[] = ['range', 'config', 'set'];
    
    // Add file flag
    cmdArgs.push('-f', file);
    
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
    const result = await cliWrapper.executeCommand('', cmdArgs);

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