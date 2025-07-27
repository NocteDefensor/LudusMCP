// ============================================================================
// LUDUS MCP TOOLS - STATIC TOOL EXPORTS
// ============================================================================
// This file exports ALL Ludus MCP tools as static objects (matching older server.ts)

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// STATIC TOOL EXPORTS - Range Planning & Research
// ============================================================================

export const ludusRangePlannerTool: Tool = {
  name: 'ludus_range_planner',
  description: '**PRIMARY RANGE ORCHESTRATOR** - Use this FIRST for any range creation! Analyzes requirements, researches roles/templates, designs VM architecture, generates structured instructions using existing MCP tools, and estimates resource requirements.',
  inputSchema: {
    type: 'object',
    properties: {
      user_intent: {
        type: 'string',
        description: 'User requirements for the range (e.g., "I need AD with SCCM and elastic monitoring")'
      },
      workstation_count: {
        type: 'number',
        description: 'Number of workstations needed (default: 2)',
        default: 2
      },
      complexity_level: {
        type: 'string',
        enum: ['simple', 'advanced', 'enterprise'],
        description: 'Complexity level (default: simple)',
        default: 'simple'
      },
      environment_type: {
        type: 'string',
        description: 'Environment type (default: active_directory)',
        default: 'active_directory'
      },
      special_requirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Special requirements or constraints'
      },
      user_context: {
        type: 'string',
        description: 'Context for file organization/naming'
      },
      output_file: {
        type: 'string',
        description: 'Optional: where to save the generated config'
      },
      preview_mode: {
        type: 'boolean',
        description: 'Just show plan, don\'t create files (default: false)'
      },
      include_testing: {
        type: 'boolean',
        description: 'Add testing/validation VMs (default: false)'
      }
    },
    required: ['user_intent']
  }
};

export const ludusRangeConfigCheckAgainstPlanTool: Tool = {
  name: 'ludus_range_config_check_against_plan',
  description: 'QA checklist tool to verify range configuration against original user requirements and plan. Used during validation phase to ensure all requirements are met.',
  inputSchema: {
    type: 'object',
    properties: {
      user_requirements: {
        type: 'string',
        description: 'Original user requirements/intent for the range'
      },
      config_content: {
        type: 'string',
        description: 'The YAML range configuration content to check'
      },
      roles_used: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of Ludus roles used in the configuration'
      },
      expected_vms: {
        type: 'number',
        description: 'Expected number of VMs based on plan'
      },
      plan_id: {
        type: 'string',
        description: 'Plan ID from ludus_range_planner output'
      }
    },
    required: ['user_requirements', 'config_content', 'roles_used']
  }
};

// Import the existing static schema tool
export { ludusReadRoleCollectionSchemaTool } from './ludusReadRoleCollectionSchema.js';

// NEW: List YAML role/collection schema files
export const ludusListRoleCollectionSchemasTool: Tool = {
  name: 'ludus_list_role_collection_schemas',
  description: 'List all available role and collection schema files (.yaml/.yml) in ~/.ludus-mcp/schemas/. Shows inventory of roles, collections, and templates with file metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      help: {
        type: 'boolean',
        description: 'Show detailed help information about this tool',
        default: false
      }
    }
  }
};

// ============================================================================
// STATIC TOOL EXPORTS - Core Range Management
// ============================================================================

export const deployRangeTool: Tool = {
  name: 'deploy_range',
  description: 'Deploy a Ludus range from a configuration file. Creates virtualized training environment. CREDENTIAL SECURITY: Ensure configs use placeholders {{LudusCredName-<user>-<name>}}. DESTRUCTIVE: Always verify before deployment.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      configPath: { type: 'string', description: 'Path to range configuration file' },
      force: { type: 'boolean', description: 'Force deployment without prompts' },
      tags: { type: 'string', description: 'Comma-separated deployment tags' },
      limit: { type: 'string', description: 'Limit deployment to specific pattern' },
      onlyRoles: { type: 'string', description: 'Deploy only specific roles' },
      verboseAnsible: { type: 'boolean', description: 'Enable verbose Ansible output' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const getRangeStatusTool: Tool = {
  name: 'get_range_status',
  description: 'Get current status of a deployed range including deployment progress and VM states.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const listUserRangesTool: Tool = {
  name: 'list_user_ranges',
  description: 'List all deployed ranges for a user, showing current status and basic information.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const getConnectionInfoTool: Tool = {
  name: 'get_connection_info',
  description: 'Download connection files (RDP, WireGuard, etc.) for accessing deployed range VMs.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      downloadLocation: { type: 'string', description: 'Custom download directory path' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const destroyRangeTool: Tool = {
  name: 'destroy_range',
  description: 'DESTRUCTIVE: Permanently destroy/stop a range, deleting all VMs and data. This action is irreversible.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      force: { type: 'boolean', description: 'Force destruction without prompts' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const rangeAbortTool: Tool = {
  name: 'range_abort',
  description: 'Abort an in-progress range deployment, stopping all deployment tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const ludusPowerTool: Tool = {
  name: 'ludus_power',
  description: 'Power management for range VMs (start/stop). Power off operations require confirmation as they may interrupt running processes.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['on', 'off'], description: 'Power action to perform' },
      user: { type: 'string', description: 'Target user (admin only)' },
      vmNames: { type: 'string', description: 'VM name(s) to power on/off. Defaults to "all"' },
      confirmDestructiveAction: { type: 'boolean', description: 'Required confirmation for power off operations. Must be true to power off VMs.' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['action']
  }
};

export const getTagsTool: Tool = {
  name: 'get_tags',
  description: 'Get available deployment tags for selective range deployment.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

// ============================================================================
// STATIC TOOL EXPORTS - Configuration Management
// ============================================================================

export const readRangeConfigTool: Tool = {
  name: 'read_range_config',
  description: 'Read and display range configuration from file or URL. Supports local files and remote URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'File path or URL to configuration' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['source']
  }
};

export const writeRangeConfigTool: Tool = {
  name: 'write_range_config',
  description: 'Write range configuration to file with automatic validation. Creates directories as needed.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Destination file path' },
      content: { type: 'string', description: 'YAML configuration content' },
      user: { type: 'string', description: 'User directory to organize configs (creates subfolder under range-config-templates)' },
      overwrite: { type: 'boolean', description: 'Overwrite existing file' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['filePath', 'content']
  }
};

export const validateRangeConfigTool: Tool = {
  name: 'validate_range_config',
  description: 'Validate range configuration against schema and best practices. Essential before deployment.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'File path or URL to validate' },
      content: { type: 'string', description: 'YAML content to validate directly' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const listRangeConfigsTool: Tool = {
  name: 'list_range_configs',
  description: 'List and analyze range configurations in directory. Provides validation status and metadata.',
  inputSchema: {
    type: 'object',
    properties: {
      directory: { type: 'string', description: 'Directory to search (optional, uses smart search if omitted)' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const getRangeConfigTool: Tool = {
  name: 'get_range_config',
  description: 'Get current range configuration from Ludus server or retrieve example configuration.',
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'Target user (admin only)' },
      example: { type: 'boolean', description: 'Get example configuration instead' },
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

export const setRangeConfigTool: Tool = {
  name: 'set_range_config',
  description: 'Apply range configuration to Ludus server. Sets active configuration for deployment.\n\n**WORKING DIRECTORY**: All file paths are relative to ~/.ludus-mcp/range-config-templates/\n\n**PATH USAGE**: Use relative paths only (e.g., "base-configs/acme.yml", "user1/config.yaml")',
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Relative file path (e.g., "base-configs/acme.yml") of the configuration file within ~/.ludus-mcp/range-config-templates/' },
      user: { type: 'string', description: 'Target user (admin only)' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['file']
  }
};

// ============================================================================
// STATIC TOOL EXPORTS - Credential & Security
// ============================================================================

export const getCredentialFromUserTool: Tool = {
  name: 'get_credential_from_user',
  description: 'Prompt user to securely enter credentials via popup dialog. Stores in OS keyring. Names must follow LudusCredName-<TargetUser>-<CredName> format.',
  inputSchema: {
    type: 'object',
    properties: {
      credName: { type: 'string', description: 'Credential name (format: LudusCredName-<TargetUser>-<CredName>)' },
      help: { type: 'boolean', description: 'Show credential naming help and examples' }
    },
    required: ['credName']
  }
};

export const insertCredsRangeConfigTool: Tool = {
  name: 'insert_creds_range_config',
  description: 'Replace credential placeholders in range config with actual values from keyring. Handles {{LudusCredName-<User>-<CredName>}} placeholders securely.',
  inputSchema: {
    type: 'object',
    properties: {
      configPath: { type: 'string', description: 'Path to range configuration file' },
      credentialMappings: { 
        type: 'object', 
        description: 'Mapping of placeholder names to credential keys',
        additionalProperties: { type: 'string' }
      },
      outputPath: { type: 'string', description: 'Output path (optional, defaults to input path)' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['configPath']
  }
};

// ============================================================================
// STATIC TOOL EXPORTS - Documentation & Search
// ============================================================================

export const ludusDocsSearchTool: Tool = {
  name: 'ludus_docs_search',
  description: 'Search Ludus documentation for configuration help, troubleshooting, and best practices.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['search', 'list_categories', 'get_category'],
        description: 'Search action to perform'
      },
      search_query: { type: 'string', description: 'Search terms for documentation' },
      category: { type: 'string', description: 'Specific category to search or retrieve' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['action']
  }
};

export const ludusRolesSearchTool: Tool = {
  name: 'ludus_roles_search',
  description: 'Search Ludus roles documentation for specific roles, variables, and usage examples.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['search', 'list_all', 'get_role_details'],
        description: 'Search action to perform'
      },
      search_query: { type: 'string', description: 'Role name or search terms' },
      role_name: { type: 'string', description: 'Specific role name for detailed info' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['action']
  }
};

export const ludusEnvironmentGuidesSearchTool: Tool = {
  name: 'ludus_environment_guides_search',
  description: 'Search environment-specific guides and tutorials for different types of cyber ranges.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['search', 'list_guides', 'get_guide'],
        description: 'Search action to perform'
      },
      search_query: { type: 'string', description: 'Environment type or search terms' },
      guide_name: { type: 'string', description: 'Specific guide name' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['action']
  }
};

export const ludusNetworkingSearchTool: Tool = {
  name: 'ludus_networking_search',
  description: 'Search networking documentation for VPN, network topology, and connectivity guidance.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['search', 'list_topics', 'get_topic'],
        description: 'Search action to perform'
      },
      search_query: { type: 'string', description: 'Networking topic or search terms' },
      topic_name: { type: 'string', description: 'Specific networking topic' },
      help: { type: 'boolean', description: 'Show help information' }
    },
    required: ['action']
  }
};

export const ludusReadRangeConfigSchemaTool: Tool = {
  name: 'ludus_read_range_config_schema',
  description: 'Direct access to official Ludus range configuration JSON schema. Provides complete structure, validation rules, and property definitions.',
  inputSchema: {
    type: 'object',
    properties: {
      search_terms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of terms to search for within the schema'
      },
      include_full_schema: {
        type: 'boolean',
        description: 'If true, returns the complete schema',
        default: false
      },
      section_filter: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['properties', 'definitions', 'required', 'examples', 'enum']
        },
        description: 'Filter to specific schema sections'
      }
    }
  }
};

// ============================================================================
// STATIC TOOL EXPORTS - Utility & Admin
// ============================================================================

export const ludusCliExecuteTool: Tool = {
  name: 'ludus_cli_execute',
  description: 'CRITICAL: Do NOT include "ludus" prefix in command - tool adds it automatically! Execute arbitrary Ludus CLI commands. Provides raw CLI access for advanced operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { 
        type: 'string', 
        description: 'The Ludus CLI command to execute (e.g., "--help", "range", "templates", "user"). Do not include "ludus" prefix.'
      },
      args: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Command arguments as array (e.g., ["logs", "-f"] for "range logs -f"). Optional if arguments are included in command string.'
      },
      user: { type: 'string', description: 'User ID to execute command for (admin only). If omitted, executes for current user.' }
    },
    required: ['command']
  }
};

export const ludusHelpTool: Tool = {
  name: 'ludus_help',
  description: 'Get help information for Ludus CLI commands and subcommands.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to get help for' },
      subcommand: { type: 'string', description: 'Subcommand to get help for' },
      user: { type: 'string', description: 'User context for help' }
    }
  }
};

export const listAllUsersTool: Tool = {
  name: 'list_all_users',
  description: 'List all users in the Ludus system. Requires admin privileges.',
  inputSchema: {
    type: 'object',
    properties: {
      help: { type: 'boolean', description: 'Show help information' }
    }
  }
};

// ============================================================================
// HANDLER EXPORTS (for server.ts)
// ============================================================================

export { handleLudusRangePlanner } from './ludusRangePlanner.js';
export { handleLudusRangeConfigCheckAgainstPlan } from './ludusRangeConfigCheckAgainstPlan.js';
export { handleLudusReadRoleCollectionSchema } from './ludusReadRoleCollectionSchema.js';
export { handleLudusListRoleCollectionSchemas } from './ludusListRoleCollectionSchemas.js';
export { handleReadRangeConfig, handleWriteRangeConfig, handleValidateRangeConfig, handleListRangeConfigs, handleGetRangeConfig } from './rangeConfig.js';
export { handleSetRangeConfig } from './setRangeConfig.js';
export { handleGetConnectionInfo } from './getConnectionInfo.js';
export { handleDestroyRange } from './destroyRange.js';
export { handleLudusPower } from './ludusPower.js';
export { handleGetCredentialFromUser } from './getCredentialFromUser.js';
export { handleInsertCredsRangeConfig } from './insertCredsRangeConfig.js';
export { handleLudusDocsSearch } from './ludusDocsSearch.js';
export { handleLudusRolesDocsRead } from './ludusRolesSearch.js';
export { handleLudusEnvironmentGuidesSearch } from './ludusEnvironmentGuidesSearch.js';
export { handleLudusNetworkingDocsRead } from './ludusNetworkingSearch.js';
export { handleLudusReadRangeConfigSchema } from './ludusReadRangeConfigSchema.js';
export { handleListAllUsers } from './listAllUsers.js'; 