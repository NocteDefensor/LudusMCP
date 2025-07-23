import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export interface DeployRangeArgs {
  user?: string;
  configPath?: string;
  force?: boolean;
  tags?: string;           // --tags "tag1,tag2" 
  limit?: string;          // --limit "pattern"
  onlyRoles?: string;      // --only-roles "role1,role2"
  verboseAnsible?: boolean; // --verbose-ansible
  help?: boolean;          // --help
}

export function createDeployRangeTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'deploy_range',
    description: `Deploy a Ludus range from a configuration file. This creates a new virtualized training environment based on the specified configuration.

CREDENTIAL SECURITY REMINDER 
Ensure range configurations use credential placeholders: {{LudusCredName-<targetUser>-<credName>}}
DO NOT deploy ranges with non-range-specific credentials such as API keys for external services, passwords not specific to the cyber range environment, or similar credentials embedded in config files!

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- VERIFY DESTRUCTIVE ACTIONS: Always confirm with user before destroy/delete operations  
- CHECK EXISTING STATE: Use list_user_ranges or get_range_status before major operations
- DESTRUCTION IS PERMANENT: Destroying ranges deletes all VMs and data irreversibly
- ADMIN vs USER: Admin operations (--user flag) affect other users' ranges - be explicit

DEPLOYMENT CONSIDERATIONS:
- Deployments take 10-45 minutes depending on complexity
- Windows domains take longer than simple Linux deployments  
- Users should monitor progress with get_range_status
- Failed deployments can be debugged with range logs

CRITICAL WORKFLOW REMINDER:
- deploy_range uses the currently SET configuration, not any specific file
- If deploying with a NEW config, you must first use set_range_config to make it active
- Typical workflow: write_range_config → validate_range_config → set_range_config → deploy_range`,
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to deploy range for (admin only). If omitted, deploys for current user.'
        },
        configPath: {
          type: 'string',
          description: 'Path to range configuration YAML file. If omitted, uses existing configuration. ENSURE: Config must use credential placeholders {{LudusCredName-<user>-<cred>}}, NOT actual credentials!'
        },
        force: {
          type: 'boolean',
          description: 'Force deployment even if range already exists',
          default: false
        },
        tags: {
          type: 'string',
          description: 'Ansible tags to run for this deploy (comma-separated, e.g. "dns,custom-groups"). Default: all tags'
        },
        limit: {
          type: 'string', 
          description: 'Limit deployment to VMs matching the specified pattern (must include localhost or no plays will run)'
        },
        onlyRoles: {
          type: 'string',
          description: 'Limit user-defined roles to this comma-separated list (e.g. "role1,role2")'
        },
        verboseAnsible: {
          type: 'boolean',
          description: 'Enable verbose output from Ansible during deployment',
          default: false
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the deploy_range command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleDeployRange(
  args: DeployRangeArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { 
    user, 
    configPath, 
    force = false, 
    tags, 
    limit, 
    onlyRoles, 
    verboseAnsible = false,
    help = false 
  } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for deploy_range command', { user });
    const result = await cliWrapper.executeArbitraryCommand('range', ['deploy', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for deploy_range command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Starting range deployment', { 
      user, 
      configPath, 
      force, 
      tags, 
      limit, 
      onlyRoles, 
      verboseAnsible 
    });

    // Deploy the range with all options (deployRange handles config setting internally)
    logger.info('Deploying range');
    
    // Build options object, filtering out undefined values
    const deployOptions: any = { force, verboseAnsible };
    if (user !== undefined) deployOptions.user = user;
    if (configPath !== undefined) deployOptions.configPath = configPath;
    if (tags !== undefined) deployOptions.tags = tags;
    if (limit !== undefined) deployOptions.limit = limit;
    if (onlyRoles !== undefined) deployOptions.onlyRoles = onlyRoles;
    
    const deployResult = await cliWrapper.deployRange(deployOptions);

    if (!deployResult.success) {
      throw new Error(`Deployment failed: ${deployResult.message}`);
    }

    const successMessage = user 
      ? `Range deployment initiated for user ${user}`
      : 'Range deployment initiated for current user';

    return {
      success: true,
      message: successMessage,
      details: deployResult.data,
      user: user || 'current',
      configPath: configPath || 'existing configuration',
      rawOutput: deployResult.rawOutput
    };

  } catch (error: any) {
    logger.error('Range deployment failed', { 
      user, 
      configPath, 
      error: error.message 
    });

    return {
      success: false,
      message: error.message,
      user: user || 'current',
      configPath: configPath || 'existing configuration'
    };
  }
} 