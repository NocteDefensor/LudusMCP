import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export interface LudusHelpArgs {
  command?: string;
  subcommand?: string;
  user?: string;
}

export function createLudusHelpTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'ludus_help',
    description: 'Get help information for Ludus CLI commands. Use this to discover available commands, learn syntax, and understand options. Can show general help or specific command help.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Specific command to get help for (e.g., "range", "templates", "user"). If omitted, shows general help.',
          examples: ['range', 'templates', 'user', 'testing']
        },
        subcommand: {
          type: 'string',
          description: 'Subcommand to get help for (e.g., "deploy", "logs", "list"). Requires command to be specified.',
          examples: ['deploy', 'logs', 'list', 'add', 'remove']
        },
        user: {
          type: 'string',
          description: 'User ID to get help for (admin only). If omitted, gets help for current user context.'
        }
      },
      required: []
    }
  };
}

export async function handleLudusHelp(
  args: LudusHelpArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { command, subcommand, user } = args;

  try {
    // Build help command based on what's requested
    let result;
    let fullCommand: string;

    if (command) {
      // For specific commands: ludus <command> [subcommand] --help
      const helpArgs: string[] = [];
      if (subcommand) {
        helpArgs.push(subcommand);
      }
      helpArgs.push('--help');
      
      // Add user context if provided
      if (user) {
        helpArgs.push('--user', user);
      }

      fullCommand = subcommand 
        ? `ludus ${command} ${subcommand} --help`
        : `ludus ${command} --help`;
      
      logger.info('Getting Ludus CLI help', { command: fullCommand, user });
      result = await cliWrapper.executeArbitraryCommand(command, helpArgs);
    } else {
      // For general help: ludus --help
      fullCommand = 'ludus --help';
      logger.info('Getting Ludus CLI help', { command: fullCommand, user });
      result = await cliWrapper.executeCommand('--help', []);
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
      success: true,
      command: fullCommand,
      user: targetUser,
      helpType: helpType,
      content: result.rawOutput || result.message,
      
      // Structured for easy parsing
      sections: parseHelpOutput(result.rawOutput || result.message)
    };

  } catch (error: any) {
    logger.error('Ludus help failed', { 
      command: command || 'help', 
      subcommand, 
      error: error.message, 
      user 
    });

    return {
      success: false,
      command: command || 'help',
      user: user || 'current user',
      error: error.message,
      content: error.message
    };
  }
}

/**
 * Parse help output into structured sections
 */
function parseHelpOutput(output: string): any {
  const sections: any = {};
  
  try {
    const lines = output.split('\n');
    let currentSection = 'description';
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect section headers
      if (trimmed.match(/^(Usage|Available Commands|Flags|Examples|Global Flags|Aliases):/)) {
        // Save previous section
        if (currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        
        // Start new section
        currentSection = trimmed.replace(':', '').toLowerCase().replace(/\s+/g, '_');
        currentContent = [];
      } else if (trimmed.length > 0) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return sections;
  } catch (error) {
    return { raw: output };
  }
} 