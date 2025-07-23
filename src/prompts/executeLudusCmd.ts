import { z } from 'zod';

// Schema for prompt arguments
const ExecuteLudusCmdArgsSchema = z.object({
  command_intent: z.string().describe('What you want to accomplish with the CLI command'),
  target_user: z.string().optional().describe('Target user for admin operations (leave empty for current user)'),
  confirm_destructive: z.boolean().optional().default(false).describe('Confirmation for destructive operations')
});

export type ExecuteLudusCmdArgs = z.infer<typeof ExecuteLudusCmdArgsSchema>;

export async function handleExecuteLudusCmdPrompt(args: ExecuteLudusCmdArgs) {
  const { command_intent, target_user, confirm_destructive = false } = args;
  
  // Convert string input to proper boolean
  const isDestructiveConfirmed = typeof confirm_destructive === 'string' 
    ? ['true', 'TRUE', 't', 'T', '1', 'yes', 'YES', 'y', 'Y'].includes(confirm_destructive)
    : confirm_destructive === true;

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Execute Ludus CLI command safely to: ${command_intent}
${target_user ? `\nTarget user: ${target_user}` : '\nTarget: Current user'}
${isDestructiveConfirmed ? '\nDESTRUCTIVE ACTION CONFIRMED by user' : ''}

LUDUS CLI EXECUTION SAFETY PROTOCOL:
Follow this protocol exactly to ensure safe and effective CLI command execution using the ludus_cli_execute tool.

STEP 1: SAFETY ASSESSMENT
- Analyze the intent: "${command_intent}"
- Determine if this is a:
  * INFORMATIONAL command (help, status, list, info) → LOW RISK
  * CONFIGURATION command (set, config, update) → MEDIUM RISK
  * DEPLOYMENT command (deploy, start, build) → HIGH RISK
  * DESTRUCTIVE command (destroy, delete, remove, abort) → CRITICAL RISK

STEP 2: TOOL PREFERENCE CHECK
Before using raw CLI, check if a dedicated MCP tool exists:
- Range deployment → use \`deploy_range\` tool instead
- Range destruction → use \`destroy_range\` tool instead  
- Range status → use \`get_range_status\` tool instead
- User management → use \`list_user_ranges\` tool instead
- Configuration → use \`set_range_config\` tool instead
- Help information → use \`ludus_help\` tool instead

ONLY use \`ludus_cli_execute\` when:
- No dedicated tool exists for your specific need
- You need advanced CLI features not covered by tools
- Troubleshooting requires raw CLI access
- User explicitly requests direct CLI access

STEP 3: PRE-EXECUTION STATE CHECK
For all non-informational commands:
1. Use \`get_range_status\` to check current range state
2. Use \`list_user_ranges\` to understand existing resources
3. Document what will be affected by your command

STEP 4: DESTRUCTIVE ACTION PROTOCOL
For destructive commands (destroy, delete, remove, abort):
- MANDATORY: Explain exactly what will be destroyed/affected
- MANDATORY: Ask for explicit user confirmation
- MANDATORY: Wait for user to confirm before proceeding
- NEVER execute destructive commands without confirmation
- Set \`confirm_destructive: true\` only AFTER user confirms

Examples of DESTRUCTIVE commands requiring confirmation:
- \`range rm\` or \`range destroy\` → Deletes entire range permanently
- \`user rm\` → Removes user account and all data
- \`range abort\` → Stops deployment, may leave partial state

STEP 5: ADMIN OPERATION AWARENESS
${target_user ? `
ADMIN OPERATION DETECTED:
- Target user: "${target_user}"
- This affects another user's resources
- Ensure you have proper authorization
- Explain impact to target user's environment
` : `
USER OPERATION:
- Affects only current user's resources
- No special permissions needed
`}

STEP 6: COMMAND EXECUTION WITH ludus_cli_execute
Use the ludus_cli_execute MCP tool for all CLI command execution:
- DO NOT include "ludus" prefix (tool adds it automatically)
- Use: \`ludus_cli_execute({ command: "range status" })\` 
- NOT: \`ludus_cli_execute({ command: "ludus range status" })\`
- For help: \`ludus_cli_execute({ command: "--help" })\` or \`ludus_cli_execute({ command: "range --help" })\`
- NOT: \`ludus_cli_execute({ command: "help" })\` (this subcommand doesn't exist)
${target_user ? `- Include user parameter: \`ludus_cli_execute({ command: "range status", user: "${target_user}" })\`` : ''}

STEP 7: ERROR HANDLING & TROUBLESHOOTING
If ludus_cli_execute command fails:
1. Check command syntax with help: \`ludus_cli_execute({ command: "command --help" })\`
2. Verify connectivity and permissions
3. Try simpler related commands to isolate the issue
4. Suggest specific tools if available for the task

CRITICAL BEHAVIORAL RULES:
SAFETY FIRST: Always prioritize user safety and data protection
CHECK BEFORE ACTING: Understand current state before making changes  
COMMUNICATE CLEARLY: Explain what commands will do before execution
CONFIRM DESTRUCTIVE: Never assume destructive actions are wanted
USE SPECIFIC TOOLS: Prefer dedicated tools over raw CLI
ADMIN AWARENESS: Be explicit about admin operations affecting other users
USE CLI WRAPPER: Execute all CLI commands through ludus_cli_execute tool

EXECUTION GUIDANCE:
${isDestructiveConfirmed ? 
  'PROCEED with destructive action - user has confirmed' :
  'If destructive: STOP and ask for confirmation first'
}

Execute the command now using the ludus_cli_execute tool following this protocol exactly.`
        }
      }
    ]
  };
} 