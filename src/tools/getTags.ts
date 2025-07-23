import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export interface GetTagsArgs {
  user?: string;
  help?: boolean;
}

export function createGetTagsTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'get_tags',
    description: 'Get the ansible tags available for use with deploy. This shows all available deployment tags that can be used with the deploy_range tool. Requires admin privileges to get tags for other users.',
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to get available tags for (admin only). If omitted, gets tags for current user.'
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the get_tags command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleGetTags(
  args: GetTagsArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { user, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for get_tags command', { user });
    const result = await cliWrapper.executeArbitraryCommand('range', ['gettags', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for get_tags command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Getting available deployment tags', { user });

    const result = await cliWrapper.getTags(user);

    if (!result.success) {
      throw new Error(`Failed to get deployment tags: ${result.message}`);
    }

    const targetUser = user || 'current user';
    
    return {
      success: true,
      message: `Available deployment tags retrieved for ${targetUser}`,
      user: targetUser,
      tags: result.data,
      rawOutput: result.rawOutput
    };
  } catch (error: any) {
    logger.error('Get tags failed', { error: error.message, user });
    throw error;
  }
} 