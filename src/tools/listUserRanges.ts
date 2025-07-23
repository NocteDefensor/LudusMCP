import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export interface ListUserRangesArgs {
  user?: string;
  help?: boolean;
}

export function createListUserRangesTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'list_user_ranges',
    description: 'List all ranges for a specific user or current user. Shows range details including status, configuration, and metadata. Requires admin privileges to list other users\' ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to list ranges for (admin only). If omitted, lists ranges for current user.'
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the list_user_ranges command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleListUserRanges(
  args: ListUserRangesArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { user, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for list_user_ranges command', { user });
    const result = await cliWrapper.executeArbitraryCommand('range', ['list', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for list_user_ranges command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Listing user ranges', { user });

    const rangesResult = await cliWrapper.listUserRanges(user);

    if (!rangesResult.success) {
      throw new Error(`Failed to list ranges: ${rangesResult.message}`);
    }

    const targetUser = user || 'current user';
    const ranges = rangesResult.data;

    // Provide helpful summary
    let summary = '';
    if (Array.isArray(ranges)) {
      summary = `Found ${ranges.length} range(s) for ${targetUser}`;
    } else if (ranges) {
      summary = `Found range information for ${targetUser}`;
    } else {
      summary = `No ranges found for ${targetUser}`;
    }

    return {
      success: true,
      message: summary,
      user: targetUser,
      ranges: ranges,
      rawOutput: rangesResult.rawOutput,
      nextSteps: ranges ? [
        'Use get_range_status() to get detailed status information',
        'Use get_connection_info() to get access credentials',
        'Use deploy_range() to deploy a new range if needed'
      ] : [
        'Use deploy_range() to deploy your first range',
        'Check available templates with list_templates()'
      ]
    };

  } catch (error: any) {
    logger.error('Failed to list user ranges', { 
      user,
      error: error.message 
    });

    return {
      success: false,
      message: error.message,
      user: user || 'current user',
      troubleshooting: [
        'Verify the user exists in the Ludus system',
        'Check if you have admin permissions (if querying other users)',
        'Ensure your Ludus server connection is working',
        'Try deploying a range first if none exist'
      ]
    };
  }
} 