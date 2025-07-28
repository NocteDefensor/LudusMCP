import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';

export interface RangeAbortArgs {
  user?: string;
  help?: boolean;
}

export function createRangeAbortTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'range_abort',
    description: `Kill the ansible process deploying a range. Use this to stop a deployment that is taking too long or has encountered issues.

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- VERIFY DESTRUCTIVE ACTIONS: Always confirm with user before destroy/delete operations  
- CHECK EXISTING STATE: Use list_user_ranges or get_range_status before major operations
- ADMIN vs USER: Admin operations (--user flag) affect other users' ranges - be explicit

ABORT OPERATION WARNING:
- Aborting may leave range in partial deployment state
- May require cleanup or full redeployment to recover
- Only abort if deployment is truly stuck or explicitly requested
- Normal deployments take 10-45 minutes - suggest waiting before aborting`,
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to abort deployment for (admin only). If omitted, aborts deployment for current user.'
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the range_abort command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleRangeAbort(
  args: RangeAbortArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { user, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for range_abort command', { user });
    const result = await cliWrapper.executeArbitraryCommand('range', ['abort', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for range_abort command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Aborting range deployment', { user });

    const result = await cliWrapper.abortRange(user);

    if (!result.success) {
      throw new Error(`Failed to abort range deployment: ${result.message}`);
    }

    const targetUser = user || 'current user';
    
    return {
      success: true,
      message: `Range deployment aborted for ${targetUser}`,
      user: targetUser,
      result: result.data,
      rawOutput: result.rawOutput
    };
  } catch (error: any) {
    logger.error('Range abort failed', { error: error.message, user });
    throw error;
  }
} 