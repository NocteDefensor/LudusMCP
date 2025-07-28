import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';

export interface LudusCliExecuteArgs {
  command: string;
  args?: string[];
  user?: string;
}

export function createLudusCliExecuteTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'ludus_cli_execute',
    description: `CRITICAL: Do NOT include "ludus" prefix in command - tool adds it automatically!

**LUDUS CLI EXECUTOR** - Execute arbitrary Ludus CLI commands and return raw output. This provides full access to the Ludus CLI for advanced operations.

CORRECT USAGE: This tool executes actual "ludus" CLI commands on the system. Use this when you need to run native Ludus commands.

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- PREFER SPECIFIC TOOLS: Use dedicated tools (deploy_range, destroy_range) instead of raw CLI when available
- VERIFY DESTRUCTIVE ACTIONS: Always confirm with user before destroy/delete operations
- CHECK EXISTING STATE: Use list_user_ranges or get_range_status before major operations
- ADMIN vs USER: Admin operations (--user flag) affect other users' ranges - be explicit

RAW CLI EXECUTION WARNINGS:
- This tool executes raw Ludus commands without safety checks
- Destructive commands (range rm, user rm) bypass normal confirmations
- Use specific tools when available for better safety and validation
- Explain command purpose and risks before executing

HELP COMMAND GUIDANCE:
- For help: Use dedicated "ludus_help" tool OR command="--help" (NOT command="help")
- For command help: Use "ludus_help" tool OR command="<command> --help" (e.g., "range --help")
- IMPORTANT: Ludus CLI has NO "help" subcommand - only uses --help flags`,
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The Ludus CLI command to execute (e.g., "--help", "range", "templates", "user"). Do not include "ludus" prefix.',
          examples: ['--help', 'range logs', 'templates list', 'user info']
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command arguments as array (e.g., ["logs", "-f"] for "range logs -f"). Optional if arguments are included in command string.',
          examples: [['logs', '-f'], ['deploy', '--tags', 'dns'], ['range', '--help']]
        },
        user: {
          type: 'string',
          description: 'User ID to execute command for (admin only). If omitted, executes for current user.'
        }
      },
      required: ['command']
    }
  };
}

export async function handleLudusCliExecute(
  args: LudusCliExecuteArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { command, args: cmdArgs = [], user } = args;

  try {
    // Build argument array securely (no string concatenation)
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
    const result = await cliWrapper.executeArbitraryCommand(parsedCommand, parsedArgs);

    // Build command string for logging (safe since only used for display)
    const commandForLogging = `ludus ${parsedCommand} ${parsedArgs.join(' ')}`;

    // Return structured response
    return {
      success: result.success,
      command: commandForLogging,
      user: user || 'current user',
      output: result.rawOutput || result.message,
      data: result.data,
      exitCode: result.success ? 0 : 1
    };

  } catch (error: any) {
    const commandForLogging = `ludus ${command} ${cmdArgs.join(' ')}`;
    logger.error('Ludus CLI execution failed', { 
      command: commandForLogging, 
      error: error.message, 
      user 
    });

    return {
      success: false,
      command: commandForLogging,
      user: user || 'current user',
      output: error.message,
      data: null,
      exitCode: 1,
      error: error.message
    };
  }
} 