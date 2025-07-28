import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';

export function createListAllUsersTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'list_all_users',
    description: 'List all users in the Ludus system (admin operation). Use this when you need to see all users, not just the current user. For individual user info, use the generic ludus_cli_execute tool with "users list".',
    inputSchema: {
      type: 'object',
      properties: {
        help: {
          type: 'boolean',
          description: 'Show help information for the list_all_users command',
          default: false
        }
      },
      additionalProperties: false
    }
  };
}

export async function handleListAllUsers(
  args: { help?: boolean },
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for list_all_users command');
    const result = await cliWrapper.executeArbitraryCommand('users', ['list', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for list_all_users command',
        help: true,
        content: result.rawOutput || result.message,
        usage: 'This tool runs "ludus users list all" to show all users in the system. No additional parameters needed.'
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Listing all users in the system');

    // Use the new listAllUsers method
    const result = await cliWrapper.listAllUsers();
    
    if (!result.success) {
      throw new Error(result.message);
    }

    // Parse the response if it's JSON
    let userData = result.data;
    if (typeof result.data === 'string') {
      try {
        userData = JSON.parse(result.data);
      } catch {
        // Not JSON, use raw data
        userData = result.data;
      }
    }

    return {
      success: true,
      message: 'Successfully retrieved all users',
      users: userData,
      rawOutput: result.rawOutput,
      usage: [
        'This shows all users in the Ludus system',
        'For individual user details, use ludus_cli_execute with "users list --user <userid>"',
        'To add/remove users, use ludus_cli_execute with "users add" or "users rm" commands'
      ]
    };

  } catch (error: any) {
    logger.error('Failed to list all users', { error: error.message });
    return {
      success: false,
      message: `Failed to list all users: ${error.message}`,
      troubleshooting: [
        'Ensure you have admin privileges to list all users',
        'Check if the Ludus server is accessible',
        'Verify your API key has the necessary permissions',
        'Try using ludus_help with "users list" for more options'
      ]
    };
  }
} 