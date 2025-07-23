import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { getCredential } from '../utils/keyring.js';
import { validateLudusRangeSchema } from './rangeConfig.js';

export interface InsertCredsRangeConfigArgs {
  configPath: string;
  credentialMappings: { [placeholder: string]: string };
  outputPath?: string;
  validateOnly?: boolean;
  user?: string;
}

// Base directory for all Ludus MCP operations
const LUDUS_MCP_BASE_DIR = path.join(os.homedir(), '.ludus-mcp');
const RANGE_CONFIG_TEMPLATES_DIR = path.join(LUDUS_MCP_BASE_DIR, 'range-config-templates');

/**
 * Resolve a file path for range configurations with smart organization
 */
function resolveConfigPath(filePath: string, user?: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  
  // If it's just a filename (no directory separators)
  if (path.dirname(filePath) === '.') {
    if (user) {
      // User specified: put in user-specific subdirectory under range-config-templates
      const userTemplatesDir = path.join(RANGE_CONFIG_TEMPLATES_DIR, user);
      return path.join(userTemplatesDir, filePath);
    } else {
      // No user specified: put in base range-config-templates directory
      return path.join(RANGE_CONFIG_TEMPLATES_DIR, filePath);
    }
  }
  
  // If it's a relative path with directories, resolve relative to .ludus-mcp/
  return path.resolve(LUDUS_MCP_BASE_DIR, filePath);
}

/**
 * Securely inject credentials into range config
 */
async function injectCredentialsIntoConfig(
  configContent: string,
  credentialMappings: { [placeholder: string]: string },
  logger: Logger
): Promise<{ success: boolean; content?: string; errors?: string[]; missingCreds?: string[] }> {
  let processedContent = configContent;
  const errors: string[] = [];
  const missingCreds: string[] = [];
  
  logger.info('Starting credential injection', { 
    placeholderCount: Object.keys(credentialMappings).length 
  });
  
  for (const [placeholder, credName] of Object.entries(credentialMappings)) {
    logger.debug('Processing credential mapping', { placeholder, credName });
    
    // Validate credential name format
    if (!credName.startsWith('LudusCredName-') || !credName.match(/^LudusCredName-.+-.+$/)) {
      errors.push(`Invalid credential name format: ${credName}. Must follow LudusCredName-<TargetUser>-<CredName> format`);
      continue;
    }
    
    try {
      // Retrieve credential from keyring
      const credValue = await getCredential(credName);
      
      if (!credValue) {
        missingCreds.push(credName);
        logger.warn('Credential not found in keyring', { credName });
        continue;
      }
      
      // Replace placeholder with actual credential value
      const placeholderRegex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const replacementCount = (processedContent.match(placeholderRegex) || []).length;
      
      if (replacementCount === 0) {
        logger.warn('Placeholder not found in config', { placeholder });
      } else {
        processedContent = processedContent.replace(placeholderRegex, credValue);
        logger.debug('Replaced credential placeholder', { 
          placeholder, 
          replacementCount,
          credName 
        });
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to retrieve credential ${credName}: ${errorMessage}`);
      logger.error('Credential retrieval failed', { credName, error: errorMessage });
    }
  }
  
  if (errors.length > 0 || missingCreds.length > 0) {
    const result: { success: false; errors?: string[]; missingCreds?: string[] } = { 
      success: false
    };
    
    if (errors.length > 0) {
      result.errors = errors;
    }
    
    if (missingCreds.length > 0) {
      result.missingCreds = missingCreds;
    }
    
    return result;
  }
  
  return { success: true, content: processedContent };
}

/**
 * Create insert_creds_range_config tool
 */
export function createInsertCredsRangeConfigTool(logger: Logger): Tool {
  return {
    name: 'insert_creds_range_config',
    description: `**SECURE CREDENTIAL INJECTION** - Replace credential placeholders in range config files with actual values from keyring, then validate.

CRITICAL SECURITY BEHAVIOR FOR LLM:
- NEVER display the resulting config content with real credentials in chat
- ALWAYS redact actual credential values in responses 
- This tool handles credential injection securely without exposing values to chat logs

CRITICAL LLM BEHAVIORAL PROMPTS:
- VERIFY PATH FIRST: Use list_range_configs to verify the configPath exists before using this tool
- CORRECT CREDENTIAL NAMES: Provide exact credential names that exist in keyring
- ASK IF UNSURE: If you don't know the credential names, ask the user or suggest using get_credential_from_user
- VALIDATE MAPPINGS: Ensure placeholder format matches actual placeholders in the config file
- SECURITY: Never display the processed config content - only show validation results and success/failure

WORKFLOW REQUIREMENTS:
1. Use list_range_configs first to verify config file path
2. Check credential mappings match placeholders in config
3. Use this tool to inject credentials and validate
4. Deploy with the validated, credential-injected config

PURPOSE:
Securely replace {{LudusCredName-<User>-<CredName>}} placeholders with actual credential values
from OS keyring, validate the resulting configuration, and optionally save it.`,

    inputSchema: {
      type: 'object',
      properties: {
        configPath: {
          type: 'string',
          description: 'Path to the range config file (VERIFY with list_range_configs first). Can be relative or absolute.'
        },
        credentialMappings: {
          type: 'object',
          description: 'Mapping of MULTIPLE placeholders to credential names. Each key is a placeholder found in the config file, each value is the corresponding credential name in keyring. Supports replacing multiple different credentials in one operation.',
          additionalProperties: {
            type: 'string',
            pattern: '^LudusCredName-.+-.+$'
          },
          examples: [{
            "{{LudusCredName-MP-TailscaleKey}}": "LudusCredName-MP-TailscaleKey",
            "{{LudusCredName-MP-TailscaleAPIKey}}": "LudusCredName-MP-TailscaleAPIKey",
            "{{LudusCredName-TestRange-DatabasePassword}}": "LudusCredName-TestRange-DatabasePassword",
            "{{LudusCredName-Admin-ServiceToken}}": "LudusCredName-Admin-ServiceToken"
          }]
        },
        outputPath: {
          type: 'string',
          description: 'Optional: Where to save the credential-injected config. If not provided, creates temporary file for validation only.'
        },
        validateOnly: {
          type: 'boolean',
          description: 'If true (default), only validates the credential-injected config without saving. If false, saves to outputPath.',
          default: true
        },
        user: {
          type: 'string',
          description: 'User context for path resolution (optional). Used when configPath is relative.'
        }
      },
      required: ['configPath', 'credentialMappings']
    }
  };
}

/**
 * Handle insert_creds_range_config tool calls
 */
export async function handleInsertCredsRangeConfig(
  args: InsertCredsRangeConfigArgs,
  logger: Logger
): Promise<any> {
  const { configPath, credentialMappings, outputPath, validateOnly = true, user } = args;

  logger.info('Handling insert_creds_range_config request', {
    configPath,
    credentialCount: Object.keys(credentialMappings).length,
    validateOnly,
    user
  });

  try {
    // Resolve and validate config path
    const resolvedConfigPath = resolveConfigPath(configPath, user);
    
    if (!fs.existsSync(resolvedConfigPath)) {
      return {
        success: false,
        error: 'Config file not found',
        configPath: resolvedConfigPath,
        originalPath: configPath,
        message: `Configuration file not found: ${resolvedConfigPath}`,
        suggestion: 'Use list_range_configs to verify the correct file path'
      };
    }

    // Read config file
    const configContent = fs.readFileSync(resolvedConfigPath, 'utf8');
    
    // Validate credential mappings
    const validationErrors: string[] = [];
    for (const [placeholder, credName] of Object.entries(credentialMappings)) {
      if (!configContent.includes(placeholder)) {
        validationErrors.push(`Placeholder "${placeholder}" not found in config file`);
      }
      if (!credName.match(/^LudusCredName-.+-.+$/)) {
        validationErrors.push(`Invalid credential name format: "${credName}"`);
      }
    }
    
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: 'Validation failed',
        validationErrors,
        configPath: resolvedConfigPath,
        message: 'Credential mapping validation failed'
      };
    }

    // Inject credentials
    const injectionResult = await injectCredentialsIntoConfig(
      configContent,
      credentialMappings,
      logger
    );
    
    if (!injectionResult.success) {
      return {
        success: false,
        error: 'Credential injection failed',
        errors: injectionResult.errors,
        missingCredentials: injectionResult.missingCreds,
        configPath: resolvedConfigPath,
        message: 'Failed to inject credentials into config',
        suggestions: injectionResult.missingCreds?.length ? [
          'Missing credentials need to be stored first using get_credential_from_user',
          'Verify credential names match exactly what was stored',
          'Check OS credential manager for stored credentials'
        ] : undefined
      };
    }

    // Validate the credential-injected YAML
    let parsedConfig;
    try {
      parsedConfig = yaml.load(injectionResult.content!);
    } catch (error) {
      return {
        success: false,
        error: 'YAML parsing failed after credential injection',
        yamlError: error instanceof Error ? error.message : String(error),
        configPath: resolvedConfigPath,
        message: 'The credential-injected config has invalid YAML syntax'
      };
    }

    // Validate against Ludus schema
    const schemaValidation = await validateLudusRangeSchema(parsedConfig, logger);
    
    // Handle output
    let finalOutputPath: string | undefined;
    
    if (!validateOnly && outputPath) {
      const resolvedOutputPath = resolveConfigPath(outputPath, user);
      const outputDir = path.dirname(resolvedOutputPath);
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write the credential-injected config
      fs.writeFileSync(resolvedOutputPath, injectionResult.content!, 'utf8');
      finalOutputPath = resolvedOutputPath;
      
      logger.info('Credential-injected config saved', { 
        outputPath: resolvedOutputPath 
      });
    }

    // Prepare response (with credential redaction)
    const response = {
      success: true,
      configPath: resolvedConfigPath,
      originalPath: configPath,
      credentialsInjected: Object.keys(credentialMappings).length,
      validation: schemaValidation,
      validateOnly,
      outputPath: finalOutputPath,
      message: validateOnly 
        ? 'Credential injection and validation completed successfully (not saved)'
        : `Credential injection completed and config saved to ${finalOutputPath}`,
      
      // Security: Never expose the actual credential-injected content
      securityNote: 'Actual credential values have been redacted from this response for security',
      
      nextSteps: validateOnly ? [
        'Configuration is valid with injected credentials',
        'Use validateOnly: false and provide outputPath to save the processed config',
        'Use set_range_config to make the processed config active',
        'Use deploy_range to deploy with real credentials'
      ] : [
        'Use set_range_config to make this the active configuration',
        'Use deploy_range to deploy with real credentials'
      ]
    };

    return response;

  } catch (error: any) {
    logger.error('insert_creds_range_config failed', {
      configPath,
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      configPath,
      message: `Failed to process credential injection: ${error.message}`
    };
  }
} 