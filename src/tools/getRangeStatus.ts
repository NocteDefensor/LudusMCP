import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export interface GetRangeStatusArgs {
  user?: string;
  help?: boolean;
}

export function createGetRangeStatusTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'get_range_status',
    description: 'Get the current status and details of a Ludus range. Shows deployment state, VM information, and range configuration. Requires admin privileges to check other users\' ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to get range status for (admin only). If omitted, gets status for current user.'
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the get_range_status command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleGetRangeStatus(
  args: GetRangeStatusArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { user, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for get_range_status command', { user });
    const result = await cliWrapper.executeArbitraryCommand('range', ['list', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for get_range_status command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Getting range status', { user });

    const statusResult = await cliWrapper.getRangeStatus(user);

    if (!statusResult.success) {
      throw new Error(`Failed to get range status: ${statusResult.message}`);
    }

    const targetUser = user || 'current user';
    
    return {
      success: true,
      message: `Range status retrieved for ${targetUser}`,
      user: targetUser,
      status: statusResult.data,
      rawOutput: statusResult.rawOutput
    };

  } catch (error: any) {
    logger.error('Failed to get range status', { 
      user,
      error: error.message 
    });

    return {
      success: false,
      message: error.message,
      user: user || 'current user',
      troubleshooting: [
        'Verify the user has a deployed range',
        'Check if you have admin permissions (if querying other users)',
        'Ensure your Ludus server connection is working',
        'Try deploying a range first if none exists'
      ]
    };
  }
} 