import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';

export interface DestroyRangeArgs {
  user?: string;
  noPrompt?: boolean;
  help?: boolean;
}

export function createDestroyRangeTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'destroy_range',
    description: `Destroy a Ludus range, permanently removing all VMs and freeing resources. This action is irreversible and will delete all data.

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- VERIFY DESTRUCTIVE ACTIONS: Always confirm with user before destroy/delete operations  
- CHECK EXISTING STATE: Use list_user_ranges or get_range_status before major operations
- DESTRUCTION IS PERMANENT: Destroying ranges deletes all VMs and data irreversibly
- ADMIN vs USER: Admin operations (--user flag) affect other users' ranges - be explicit

DESTRUCTIVE OPERATION WARNING:
- This operation permanently deletes resources and cannot be undone
- Confirm user intent explicitly before proceeding
- Suggest checking range status first to show what will be affected
- Explain the time commitment and impact of the operation`,
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to destroy range for (admin only). If omitted, destroys range for current user.'
        },
        noPrompt: {
          type: 'boolean',
          description: 'Skip the confirmation prompt when destroying the range',
          default: false
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the destroy_range command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleDestroyRange(
  args: DestroyRangeArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { user, noPrompt = false, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for destroy range command', { user, noPrompt });
    const result = await cliWrapper.executeArbitraryCommand('range', ['rm', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for ludus range rm command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  // Execute the destroy range command
  logger.info('Executing destroy range command', { user, noPrompt });

  try {
    const destroyResult = await cliWrapper.destroyRange(user, noPrompt);
    
    if (destroyResult.success) {
      logger.info('Destroy range command completed successfully', { 
        user: user || 'current user',
        result: destroyResult.message 
      });
      
      return {
        success: true,
        message: destroyResult.message,
        data: destroyResult.data,
        rawOutput: destroyResult.rawOutput,
        user: user || 'current user',
        operation: 'destroy_range',
        timestamp: new Date().toISOString()
      };
    } else {
      logger.error('Destroy range command failed', { 
        user: user || 'current user',
        error: destroyResult.message 
      });
      
      return {
        success: false,
        message: `Failed to destroy range: ${destroyResult.message}`,
        error: destroyResult.message,
        user: user || 'current user',
        operation: 'destroy_range',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Exception during destroy range operation', { 
      user: user || 'current user',
      error: errorMessage 
    });
    
    throw new Error(`Destroy range operation failed: ${errorMessage}`);
  }
} 