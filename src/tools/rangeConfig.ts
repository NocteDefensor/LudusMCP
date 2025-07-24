import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';
import Ajv from 'ajv';

// Base directory for all Ludus MCP operations
const LUDUS_MCP_BASE_DIR = path.join(os.homedir(), '.ludus-mcp');
const RANGE_CONFIG_TEMPLATES_DIR = path.join(LUDUS_MCP_BASE_DIR, 'range-config-templates');

/**
 * Resolve a file path for range configurations with security validation
 * SECURITY: Only allows access within ~/.ludus-mcp/range-config-templates/ directory
 * 
 * BLOCKED PATTERNS:
 * - Absolute paths: "/etc/passwd", "C:\Windows\System32"
 * - Path traversal: "../../../etc/passwd", "~/.ssh/authorized_keys"
 * - Invalid characters: ";", "&", "|", "`", "$", etc.
 * - Wrong extensions: ".exe", ".sh", ".bat" (only .yml, .yaml, .json allowed)
 * 
 * ALLOWED PATTERNS:
 * - Simple filenames: "my-config.yml"
 * - Subdirectories: "base-configs/acme.yml", "user1/config.yaml"
 * - Safe characters: alphanumeric, ".", "_", "-", "/"
 */
function resolveConfigPath(filePath: string, user?: string): string {
  // SECURITY: Block absolute paths completely
  if (path.isAbsolute(filePath)) {
    throw new Error('Absolute file paths are not allowed for security reasons. Use relative paths only.');
  }
  
  // SECURITY: Block path traversal attempts
  if (filePath.includes('..') || filePath.includes('~')) {
    throw new Error('Path traversal patterns (../, ~) are not allowed for security reasons. Use relative paths only (e.g., "base-configs", "user1/config.yml").');
  }
  
  // SECURITY: Block Windows and Unix path separators at start
  if (filePath.startsWith('/') || filePath.startsWith('\\')) {
    throw new Error('Paths cannot start with / or \\ for security reasons.');
  }
  
  // SECURITY: Validate file path characters (only allow safe characters)
  const safePathRegex = /^[a-zA-Z0-9._/-]+$/;
  if (!safePathRegex.test(filePath)) {
    throw new Error('File path contains invalid characters. Only alphanumeric, dots, dashes, underscores, and forward slashes are allowed.');
  }
  
  // SECURITY: Validate file extension (only allow config file extensions)
  const allowedExtensions = ['.yml', '.yaml', '.json'];
  const fileExtension = path.extname(filePath).toLowerCase();
  if (fileExtension && !allowedExtensions.includes(fileExtension)) {
    throw new Error(`File extension '${fileExtension}' is not allowed. Only .yml, .yaml, and .json files are supported.`);
  }
  
  let resolvedPath: string;
  
  // If it's just a filename (no directory separators)
  if (path.dirname(filePath) === '.') {
    if (user) {
      // User specified: put in user-specific subdirectory under range-config-templates
      const userTemplatesDir = path.join(RANGE_CONFIG_TEMPLATES_DIR, user);
      resolvedPath = path.join(userTemplatesDir, filePath);
    } else {
      // No user specified: put in base range-config-templates directory
      resolvedPath = path.join(RANGE_CONFIG_TEMPLATES_DIR, filePath);
    }
  } else {
    // If it's a relative path with directories, resolve relative to range-config-templates
    resolvedPath = path.join(RANGE_CONFIG_TEMPLATES_DIR, filePath);
  }
  
  // SECURITY: Final check - ensure resolved path is within allowed directory
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedAllowed = path.normalize(RANGE_CONFIG_TEMPLATES_DIR);
  
  if (!normalizedResolved.startsWith(normalizedAllowed + path.sep) && normalizedResolved !== normalizedAllowed) {
    throw new Error('Resolved file path is outside the allowed directory for security reasons.');
  }
  
  return normalizedResolved;
}

/**
 * Ensure the base directory and range-config structure exist
 */
function ensureBaseDirExists(): void {
  if (!fs.existsSync(LUDUS_MCP_BASE_DIR)) {
    fs.mkdirSync(LUDUS_MCP_BASE_DIR, { recursive: true });
  }
  
  // Ensure range-config-templates directory exists (for files without user)
  if (!fs.existsSync(RANGE_CONFIG_TEMPLATES_DIR)) {
    fs.mkdirSync(RANGE_CONFIG_TEMPLATES_DIR, { recursive: true });
  }
}

/**
 * Ensure user-specific range config directory exists
 */
function ensureUserRangeConfigDir(user?: string): string {
  const currentUser = user || 'current-user';
  const userTemplatesDir = path.join(RANGE_CONFIG_TEMPLATES_DIR, currentUser);
  
  if (!fs.existsSync(userTemplatesDir)) {
    fs.mkdirSync(userTemplatesDir, { recursive: true });
  }
  
  return userTemplatesDir;
}

// Basic Ludus range schema validation
interface LudusRange {
  ludus?: {
    cloud?: {
      proxmox?: {
        nodes?: Array<{
          hostname: string;
          ip: string;
          username: string;
          ssh_key: string;
        }>;
      };
    };
  };
  vms?: Array<{
    hostname: string;
    template?: string;
    vlan?: number;
    ip_last_octet?: number;
    ram_gb?: number;
    cpus?: number;
    linux?: boolean;
    testing?: {
      snapshot?: boolean;
      block_internet?: boolean;
    };
    roles?: string[];
  }>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReadRangeConfigArgs {
  source: string; // file path or URL
}

export interface WriteRangeConfigArgs {
  content: string; // YAML content
  filePath: string; // where to save
  user?: string; // user directory to organize configs (optional, defaults to 'current-user')
}

export interface ValidateRangeConfigArgs {
  source?: string; // file path or URL
  content?: string; // inline YAML content
}

export interface ListRangeConfigsArgs {
  directory?: string; // directory path to search (optional - uses smart defaults)
  recursive?: boolean; // whether to search subdirectories (default: true for smart defaults)
}

export interface GetRangeConfigArgs {
  example?: boolean; // get example config instead of current config
  user?: string; // user to get config for (admin only)
}

/**
 * Get allowed base paths for security validation
 * Only allows access to range-config-templates directory
 */
function getAllowedBasePaths(): string[] {
  const allowedPaths = [];
  
  // Only allow range-config-templates directory and subdirectories
  const rangeConfigTemplatesDir = path.join(os.homedir(), '.ludus-mcp', 'range-config-templates');
  allowedPaths.push(path.resolve(rangeConfigTemplatesDir));
  
  return allowedPaths;
}

/**
 * Get default directories to search for range configurations
 * Restricts search to range-config-templates directory only
 */
function getDefaultSearchDirectories(): string[] {
  const searchDirs = [];
  
  // Primary search location: ~/.ludus-mcp/range-config-templates/ and subdirectories
  const rangeConfigTemplatesDir = path.join(os.homedir(), '.ludus-mcp', 'range-config-templates');
  searchDirs.push(rangeConfigTemplatesDir);
  
  return searchDirs;
}

/**
 * Validate that a directory path is within allowed security boundaries
 */
function validateDirectoryPath(requestedPath: string): { valid: boolean; error?: string } {
  try {
    const resolvedPath = path.resolve(requestedPath);
    const allowedPaths = getAllowedBasePaths();
    
    // Check if the resolved path is within any of the allowed base paths
    const isAllowed = allowedPaths.some(basePath => {
      const relativePath = path.relative(basePath, resolvedPath);
      // If relative path doesn't start with '..', it's within the base path
      return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    });
    
    if (!isAllowed) {
      return {
        valid: false,
        error: `Access denied: Directory must be within MCP root (${process.cwd()}) or ~/.ludus-mcp/`
      };
    }
    
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid path: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Recursively find all YAML files in a directory
 */
function findYamlFilesRecursively(directory: string, recursive: boolean = false): string[] {
  const yamlFiles: string[] = [];
  
  try {
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory() && recursive) {
        // Recursively search subdirectories
        yamlFiles.push(...findYamlFilesRecursively(filePath, recursive));
      } else if (stats.isFile() && (file.toLowerCase().endsWith('.yml') || file.toLowerCase().endsWith('.yaml'))) {
        yamlFiles.push(filePath);
      }
    }
  } catch (error) {
    // Ignore directories we can't read
  }
  
  return yamlFiles;
}

// Cache for the official Ludus schema
let cachedLudusSchema: any = null;

/**
 * Fetch the official Ludus range configuration schema
 */
async function fetchLudusSchema(logger: Logger): Promise<any> {
  if (cachedLudusSchema) {
    return cachedLudusSchema;
  }

  const schemaUrl = 'https://docs.ludus.cloud/schemas/range-config.json';
  logger.info('Fetching official Ludus schema', { url: schemaUrl });

  try {
    const response = await fetch(schemaUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    cachedLudusSchema = await response.json();
    logger.info('Successfully cached Ludus schema', { 
      schemaProperties: Object.keys(cachedLudusSchema.properties || {}).length,
      hasMetaSchema: !!cachedLudusSchema.$schema,
      schemaTitle: cachedLudusSchema.title || 'Unknown'
    });
    
    return cachedLudusSchema;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to fetch Ludus schema', { error: errorMessage });
    throw new Error(`Failed to fetch official Ludus schema: ${errorMessage}`);
  }
}

/**
 * Validate Ludus range configuration against official schema
 */
export async function validateLudusRangeSchema(config: any, logger: Logger): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    // Fetch the official schema
    const rawSchema = await fetchLudusSchema(logger);
    
    // Remove the $schema property that causes AJV issues with meta-schema resolution
    const schema = { ...rawSchema };
    delete schema.$schema;
    
    // Create AJV validator instance
    const ajv = new Ajv({ 
      allErrors: true, // Report all errors, not just the first one
      verbose: true,   // Include schema and data in errors
      strict: false,   // Allow unknown keywords in schema
      validateFormats: false // Skip format validation for better compatibility
    });
    
    // Compile the schema
    const validate = ajv.compile(schema);
    
    // Validate the config
    const isValid = validate(config);
    
    if (!isValid && validate.errors) {
      result.valid = false;
      
      // Convert AJV errors to readable format
      validate.errors.forEach(error => {
        const path = error.instancePath ? `at ${error.instancePath}` : 'at root';
        const message = error.message || 'validation failed';
        
        if (error.keyword === 'required') {
          result.errors.push(`Missing required property ${path}: ${error.params?.missingProperty || 'unknown property'}`);
        } else if (error.keyword === 'type') {
          result.errors.push(`Invalid type ${path}: expected ${error.params?.type}, got ${typeof error.data}`);
        } else if (error.keyword === 'enum') {
          result.errors.push(`Invalid value ${path}: must be one of [${error.params?.allowedValues?.join(', ') || 'see schema'}]`);
        } else if (error.keyword === 'additionalProperties') {
          result.errors.push(`Unknown property ${path}: ${error.params?.additionalProperty} is not allowed`);
        } else {
          result.errors.push(`Schema violation ${path}: ${message}`);
        }
      });
    } else {
      logger.info('Configuration passed official Ludus schema validation');
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Schema validation failed', { error: errorMessage });
    result.valid = false;
    result.errors.push(`Schema validation error: ${errorMessage}`);
  }

  return result;
}

/**
 * Read config content from local file or URL with security validation
 */
async function readConfigContent(source: string, logger: Logger): Promise<string> {
  logger.info('Reading config from source', { source });
  
  // Check if it's a URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    logger.info('Fetching config from URL', { url: source });
    
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const content = await response.text();
      logger.info('Successfully fetched config from URL', { 
        url: source, 
        contentLength: content.length 
      });
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch config from URL', { url: source, error: errorMessage });
      throw new Error(`Failed to fetch from URL: ${errorMessage}`);
    }
  } else {
    // Local file - validate security boundaries first
    ensureBaseDirExists();
    const resolvedPath = resolveConfigPath(source);
    
    // Security validation: ensure the resolved path is within allowed boundaries
    const allowedPaths = getAllowedBasePaths();
    const isAllowed = allowedPaths.some(basePath => {
      const relative = path.relative(basePath, resolvedPath);
      return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
    
    if (!isAllowed) {
      const errorMessage = `Access denied: file path '${resolvedPath}' is outside allowed directories. Allowed paths: ${allowedPaths.join(', ')}`;
      logger.error('Security validation failed for file access', { 
        source, 
        resolvedPath, 
        allowedPaths 
      });
      throw new Error(errorMessage);
    }
    
    logger.info('Reading config from local file', { 
      originalPath: source,
      resolvedPath: resolvedPath 
    });
    
    try {
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File does not exist: ${resolvedPath}`);
      }
      
      const content = fs.readFileSync(resolvedPath, 'utf8');
      logger.info('Successfully read config from file', { 
        originalPath: source,
        resolvedPath: resolvedPath, 
        contentLength: content.length 
      });
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to read config from file', { 
        originalPath: source,
        resolvedPath: resolvedPath, 
        error: errorMessage 
      });
      throw new Error(`Failed to read file: ${errorMessage}`);
    }
  }
}

/**
 * Create read_range_config tool
 */
export function createReadRangeConfigTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'read_range_config',
    description: `Read and return the content of a Ludus range configuration file from local filesystem or remote URL. Does not perform validation - use for examining configs.

**WORKING DIRECTORY**: All local file paths are relative to ~/.ludus-mcp/range-config-templates/

**PATH USAGE**: 
- Use relative paths only: "base-configs/acme.yml", "user1/config.yaml", "mp/settings.yml"
- DO NOT use: "~/.ludus-mcp/...", "/absolute/paths", or "../traversal"
- URLs (http/https) are allowed for remote configs

**EXAMPLES**:
- source: "base-configs/acme.yml" → reads ~/.ludus-mcp/range-config-templates/base-configs/acme.yml
- source: "user1/config.yaml" → reads ~/.ludus-mcp/range-config-templates/user1/config.yaml
- source: "https://example.com/config.yml" → reads from URL

CRITICAL LLM BEHAVIOR: CREDENTIAL REDACTION REQUIRED 
When displaying configuration content in conversation, you MUST replace any non-range-specific credentials such as API keys for external services, passwords not specific to the cyber range environment, or similar credentials with "REDACTED-CREDENTIAL" to prevent credential exposure in chat logs.`,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Relative file path (e.g., "base-configs/acme.yml") or URL (http/https) of the range configuration to read. Local files must be within ~/.ludus-mcp/range-config-templates/'
        }
      },
      required: ['source']
    }
  };
}

/**
 * Create write_range_config tool
 */
export function createWriteRangeConfigTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'write_range_config',
    description: `Write range configuration content to a local file with automatic schema validation. The config will be validated against Ludus range schema before being saved.

**FILE PATH REQUIREMENTS**: 
- Use relative paths only (e.g., "base-configs/acme.yml", "user1/config.yaml")
- All files must be within ~/.ludus-mcp/range-config-templates/ directory
- Only .yml, .yaml, and .json extensions allowed
- Safe characters only: alphanumeric, dots, dashes, underscores, forward slashes

CRITICAL SECURITY WARNING - CREDENTIAL HANDLING RULES 
**EXTERNAL SERVICE CREDENTIALS** (use placeholders): API keys for Tailscale/cloud services, SaaS tokens, external database connections
- Format: {{LudusCredName-<targetLudusUser>-<CredentialName>}}
- Examples: {{LudusCredName-MP-TailscaleKey}}, {{LudusCredName-Admin-APIToken}}

**RANGE-INTERNAL CREDENTIALS** (include directly): Active Directory passwords, SCCM passwords, domain passwords, local Windows/Linux accounts, internal database passwords
- Format: Direct inclusion in YAML (e.g., "ClientPushPassword": "P@ssw0rd123!")
- Examples: Active Directory admin passwords, SCCM service account passwords, domain controller passwords, local SQL passwords, Windows service account passwords

CRITICAL LLM BEHAVIOR: CREDENTIAL REDACTION REQUIRED 
When displaying configuration content in conversation, you MUST replace any external service credentials (API keys, SaaS tokens) with "REDACTED-CREDENTIAL" but can show range-internal passwords directly as they are part of the lab environment.

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- CHECK EXISTING STATE: Use read_range_config to check if file exists before overwriting
- Configuration changes overwrite existing settings - warn users about data loss
- Always validate configurations before writing to prevent deployment failures
- NEVER include actual API keys, passwords, or tokens in config content
- Use credential placeholders: {{LudusCredName-<targetUser>-<credName>}}
- REDACT credentials when showing config content to users

CRITICAL USER PARAMETER USAGE:
- EXTRACT USER INTENT: When user says "for [username]", "create for [username]", "[username] user", etc. → set user parameter
- USER-SPECIFIC CONFIGS: Use user parameter when creating configs for specific users or when organizing by user
- GENERAL TEMPLATES: Omit user parameter for general-purpose templates or base configurations

EXAMPLES:
- "Create SCCM config for TestRange user" → user: "TestRange"
- "Make this template for admin" → user: "admin" 
- "Generate config for MP user" → user: "MP"
- "Create a basic template" → user: undefined (goes to base templates)
- "Save this config" → user: undefined (unless context indicates specific user)

CRITICAL WORKFLOW REMINDER:
- After writing a config file, you must use set_range_config to make it the active configuration
- Only THEN can you deploy_range - deployment uses the currently SET config, not just any file
- Typical workflow: write_range_config → validate_range_config → set_range_config → deploy_range`,
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'YAML content of the range configuration to write. CRITICAL: DO NOT include actual credentials! Use placeholders like {{LudusCredName-<targetUser>-<credName>}} instead.'
        },
        filePath: {
          type: 'string', 
          description: 'Relative file path where to save the configuration (e.g., "base-configs/acme.yml", "user1/config.yaml"). Only .yml, .yaml, .json extensions allowed. Files saved within ~/.ludus-mcp/range-config-templates/ directory.'
        },
        user: {
          type: 'string',
          description: 'User directory to organize configs under (EXTRACT FROM USER INTENT). When user mentions "for [username]", "create for [username]", "[username] user", etc., use this parameter. If specified, files will be saved in ~/.ludus-mcp/range-config-templates/<user>/. If not specified, files will be saved in ~/.ludus-mcp/range-config-templates/. Examples: "TestRange", "admin", "MP"'
        }
      },
      required: ['content', 'filePath']
    }
  };
}

/**
 * Create validate_range_config tool
 */
export function createValidateRangeConfigTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'validate_range_config',
    description: `Validate a Ludus range configuration against the schema. Can validate from file path, URL, or inline content.

CREDENTIAL SECURITY REMINDER 
If validating inline content, DO NOT include non-range-specific credentials such as API keys for external services, passwords not specific to the cyber range environment, or similar!
Use placeholders: {{LudusCredName-<targetUser>-<credName>}}

CRITICAL LLM BEHAVIOR: CREDENTIAL REDACTION REQUIRED 
When displaying configuration content in conversation, you MUST replace any non-range-specific credentials such as API keys for external services, passwords not specific to the cyber range environment, or similar credentials with "REDACTED-CREDENTIAL" to prevent credential exposure in chat logs.

CRITICAL WORKFLOW REMINDER:
- After validating a config file, you must use set_range_config to make it the active configuration
- Only THEN can you deploy_range - deployment uses the currently SET config, not just any file
- Typical workflow: write_range_config → validate_range_config → set_range_config → deploy_range`,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'File path (relative or absolute) or URL (http/https) of the range configuration to validate'
        },
        content: {
          type: 'string',
          description: 'Inline YAML content to validate (alternative to source). CRITICAL: DO NOT include actual credentials! Use placeholders like {{LudusCredName-<targetUser>-<credName>}}.'
        }
      },
      oneOf: [
        { required: ['source'] },
        { required: ['content'] }
      ]
    }
  };
}

/**
 * Create list_range_configs tool
 */
export function createListRangeConfigsTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'list_range_configs',
    description: `List range configuration files within the Ludus MCP templates directory. Shows file names, sizes, and validation status.

**WORKING DIRECTORY**: All paths are relative to ~/.ludus-mcp/range-config-templates/ 

**PATH USAGE**: 
- Use relative paths only: "base-configs", "user1", "mp/configs"
- DO NOT use: "~/.ludus-mcp/...", "/absolute/paths", or "../traversal"
- If no directory specified, automatically searches all templates recursively

**FILE RESTRICTIONS**: 
- Only searches .yml, .yaml, and .json files
- All directories must be within the templates directory for security

**EXAMPLES**:
- directory: "base-configs" → searches ~/.ludus-mcp/range-config-templates/base-configs/
- directory: "user1" → searches ~/.ludus-mcp/range-config-templates/user1/
- (no directory) → searches all of ~/.ludus-mcp/range-config-templates/

CRITICAL WORKFLOW REMINDER:
- To deploy with a specific config file, you must first use set_range_config to make it active
- deploy_range uses the currently SET config, not just any config file
- Typical workflow: choose config → set_range_config → deploy_range`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Relative directory path within ~/.ludus-mcp/range-config-templates/ to search (e.g., "base-configs", "user1", "mp/configs"). Do NOT include "~/.ludus-mcp" or absolute paths. If omitted, searches all templates automatically.'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to search subdirectories recursively. Default: true for smart search, false for specific directory.',
          default: false
        }
      },
      required: []
    }
  };
}

/**
 * Create get_range_config tool
 */
export function createGetRangeConfigTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'get_range_config',
    description: `Get the current range configuration for a user, or get an example configuration.

CRITICAL LLM BEHAVIOR: CREDENTIAL REDACTION REQUIRED 
When displaying configuration content in conversation, you MUST replace any non-range-specific credentials such as API keys for external services, passwords not specific to the cyber range environment, or similar credentials with "REDACTED-CREDENTIAL" to prevent credential exposure in chat logs.

IMPORTANT LLM BEHAVIORAL PROMPTS:
- SAFETY FIRST: Ludus operations can be destructive and time-consuming
- CHECK EXISTING STATE: This shows current configuration state
- ADMIN vs USER: Admin operations (--user flag) affect other users' ranges - be explicit
- Use this to examine current settings before making changes
- REDACT credentials when showing config content to users`,
    inputSchema: {
      type: 'object',
      properties: {
        example: {
          type: 'boolean',
          description: 'Get an example range configuration instead of current user configuration',
          default: false
        },
        user: {
          type: 'string',
          description: 'User ID to get configuration for (admin only). If omitted, gets configuration for current user.'
        }
      },
      required: []
    }
  };
}

/**
 * Handle read_range_config tool calls
 */
export async function handleReadRangeConfig(args: ReadRangeConfigArgs, logger: Logger): Promise<any> {
  logger.info('Handling read_range_config request', { args });
  
  try {
    const content = await readConfigContent(args.source, logger);
    
    return {
      success: true,
      source: args.source,
      content: content,
      contentLength: content.length,
      message: `Successfully read configuration from ${args.source}`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('read_range_config failed', { args, error: errorMessage });
    
    return {
      success: false,
      source: args.source,
      error: errorMessage,
      message: `Failed to read configuration: ${errorMessage}`
    };
  }
}

/**
 * Handle write_range_config tool calls
 */
export async function handleWriteRangeConfig(args: WriteRangeConfigArgs, logger: Logger): Promise<any> {
  logger.info('Handling write_range_config request', { 
    filePath: args.filePath,
    user: args.user || 'none',
    contentLength: args.content.length 
  });
  
  // CRITICAL SECURITY CHECK - Detect potential credential leakage
  const credentialWarnings: string[] = [];
  const suspiciousPatterns = [
    /api[_-]?key\s*[:=]\s*['"]\s*[a-zA-Z0-9+/]{20,}['"]/i,
    /token\s*[:=]\s*['"]\s*[a-zA-Z0-9+/]{20,}['"]/i,
    /password\s*[:=]\s*['"]\s*[^'"\s]{8,}['"]/i,
    /secret\s*[:=]\s*['"]\s*[a-zA-Z0-9+/]{20,}['"]/i,
    /key\s*[:=]\s*['"]\s*[a-zA-Z0-9+/]{20,}['"]/i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(args.content)) {
      credentialWarnings.push('Potential credential detected in config content');
      break;
    }
  }
  
  if (credentialWarnings.length > 0) {
    logger.warn('POTENTIAL CREDENTIAL LEAK DETECTED', { 
      filePath: args.filePath,
      warnings: credentialWarnings 
    });
  }
  
  try {
    // First validate YAML syntax
    let parsedConfig;
    try {
      parsedConfig = yaml.load(args.content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('YAML parsing failed', { error: errorMessage });
      return {
        success: false,
        filePath: args.filePath,
        error: `Invalid YAML syntax: ${errorMessage}`,
        message: 'Configuration not saved due to YAML syntax errors'
      };
    }
    
    // Validate against Ludus schema
    const validation = await validateLudusRangeSchema(parsedConfig, logger);
    
    if (!validation.valid) {
      logger.error('Schema validation failed', { 
        errors: validation.errors,
        warnings: validation.warnings 
      });
      return {
        success: false,
        filePath: args.filePath,
        validation: validation,
        error: 'Schema validation failed',
        message: 'Configuration not saved due to schema validation errors'
      };
    }
    
    // Ensure base directory exists and resolve file path with smart organization
    ensureBaseDirExists();
    const resolvedPath = resolveConfigPath(args.filePath, args.user);
    
    // Ensure user-specific directory exists if user is specified and using filename only
    if (path.dirname(args.filePath) === '.' && args.user) {
      ensureUserRangeConfigDir(args.user);
    }
    
    // Create directory if it doesn't exist
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info('Created directory', { directory: dir });
    }
    
    // Write file
    fs.writeFileSync(resolvedPath, args.content, 'utf8');
    
    logger.info('Successfully wrote range config', { 
      originalPath: args.filePath,
      resolvedPath: resolvedPath,
      user: args.user || 'none',
      contentLength: args.content.length,
      validation: validation
    });
    
    // Prepare response message with any warnings
    let message = `Successfully saved configuration to ${resolvedPath}`;
    
    // Add organization info if using filename only
    if (path.dirname(args.filePath) === '.') {
      if (args.user) {
        message += ` (organized under user: ${args.user})`;
      } else {
        message += ` (saved to base templates directory)`;
      }
    }
    
    if (validation.warnings.length > 0) {
      message += ' (with schema warnings)';
    }
    if (credentialWarnings.length > 0) {
      message += ' WARNING: Potential credentials detected!';
    }
    
    return {
      success: true,
      filePath: resolvedPath,
      originalPath: args.filePath,
      user: args.user || 'none',
      userDirectory: path.dirname(args.filePath) === '.' && args.user ? 
        path.join(RANGE_CONFIG_TEMPLATES_DIR, args.user) : 
        (path.dirname(args.filePath) === '.' ? RANGE_CONFIG_TEMPLATES_DIR : undefined),
      contentLength: args.content.length,
      validation: validation,
      credentialWarnings: credentialWarnings.length > 0 ? credentialWarnings : undefined,
      securityReminder: credentialWarnings.length > 0 ? 
        'Use credential placeholders: {{LudusCredName-<targetUser>-<credName>}} instead of actual credentials!' : 
        undefined,
      message
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('write_range_config failed', { args: { filePath: args.filePath }, error: errorMessage });
    
    return {
      success: false,
      filePath: args.filePath,
      error: errorMessage,
      message: `Failed to write configuration: ${errorMessage}`
    };
  }
}

/**
 * Handle validate_range_config tool calls
 */
export async function handleValidateRangeConfig(args: ValidateRangeConfigArgs, logger: Logger): Promise<any> {
  logger.info('Handling validate_range_config request', { args });
  
  try {
    let content: string;
    let source: string;
    
    if (args.content) {
      content = args.content;
      source = 'inline content';
    } else if (args.source) {
      content = await readConfigContent(args.source, logger);
      source = args.source;
    } else {
      return {
        success: false,
        error: 'Either source or content must be provided',
        message: 'Validation failed: no input provided'
      };
    }
    
    // Parse YAML
    let parsedConfig;
    try {
      parsedConfig = yaml.load(content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('YAML parsing failed', { error: errorMessage });
      return {
        success: false,
        source: source,
        validation: {
          valid: false,
          errors: [`Invalid YAML syntax: ${errorMessage}`],
          warnings: []
        },
        message: 'Validation failed: invalid YAML syntax'
      };
    }
    
    // Validate against Ludus schema
    const validation = await validateLudusRangeSchema(parsedConfig, logger);
    
    logger.info('Validation completed', { 
      source: source,
      valid: validation.valid,
      errors: validation.errors.length,
      warnings: validation.warnings.length 
    });
    
    return {
      success: true,
      source: source,
      validation: validation,
      message: validation.valid 
        ? `Configuration is valid${validation.warnings.length > 0 ? ' (with warnings)' : ''}` 
        : 'Configuration has validation errors'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('validate_range_config failed', { args, error: errorMessage });
    
    return {
      success: false,
      source: args.source || 'inline content',
      error: errorMessage,
      message: `Validation failed: ${errorMessage}`
    };
  }
}

/**
 * Handle list_range_configs tool calls
 */
export async function handleListRangeConfigs(args: ListRangeConfigsArgs, logger: Logger): Promise<any> {
  // Default to recursive when using smart defaults, or use provided value
  const recursive = args.recursive !== undefined ? args.recursive : (args.directory ? false : true);
  
  // If no directory specified, use smart fallback search
  if (!args.directory) {
    return await handleSmartFallbackSearch(recursive, logger);
  }

  // Resolve directory path relative to ~/.ludus-mcp/ if provided and not absolute
  ensureBaseDirExists();
  const targetDirectory = resolveConfigPath(args.directory);
  
  logger.info('Listing range configurations', { 
    originalDirectory: args.directory,
    resolvedDirectory: targetDirectory, 
    recursive,
    allowedPaths: getAllowedBasePaths()
  });
  
  try {
    // Security: Validate directory path is within allowed boundaries
    const pathValidation = validateDirectoryPath(targetDirectory);
    if (!pathValidation.valid) {
      return {
        success: false,
        directory: targetDirectory,
        error: 'Security restriction',
        message: pathValidation.error,
        allowedPaths: getAllowedBasePaths()
      };
    }

    // Check if directory exists
    if (!fs.existsSync(targetDirectory)) {
      return {
        success: false,
        directory: targetDirectory,
        error: 'Directory does not exist',
        message: `Directory not found: ${targetDirectory}`
      };
    }

    // Check if it's actually a directory
    const stats = fs.statSync(targetDirectory);
    if (!stats.isDirectory()) {
      return {
        success: false,
        directory: targetDirectory,
        error: 'Path is not a directory',
        message: `Path exists but is not a directory: ${targetDirectory}`
      };
    }

    return await searchDirectoryForConfigs(targetDirectory, recursive, logger);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('list_range_configs failed', { args, error: errorMessage });
    
    return {
      success: false,
      directory: targetDirectory,
      recursive,
      error: errorMessage,
      message: `Failed to list configurations: ${errorMessage}`    };
  }
}

/**
 * Handle get_range_config tool calls
 */
export async function handleGetRangeConfig(args: GetRangeConfigArgs, logger: Logger, cliWrapper: LudusCliWrapper): Promise<any> {
  const { example = false, user } = args;
  
  logger.info('Handling get_range_config request', { args });
  
  try {
    // Build the command arguments
    const cmdArgs: string[] = ['config', 'get'];
    
    // Add example argument if requested
    if (example) {
      cmdArgs.push('example');
    }
    
    // Add user flag if specified
    if (user) {
      cmdArgs.push('--user', user);
    }

    // Execute the command
    const result = await cliWrapper.executeCommand('range', cmdArgs);

    const targetUser = user || 'current user';
    const configType = example ? 'example configuration' : `current range configuration for ${targetUser}`;
    
    if (result.success) {
      return {
        success: true,
        user: targetUser,
        example: example,
        content: result.rawOutput || result.message,
        message: `Successfully retrieved ${configType}`
      };
    } else {
      return {
        success: false,
        user: targetUser,
        example: example,
        error: result.rawOutput || result.message,
        message: `Failed to get ${configType}: ${result.rawOutput || result.message}`
      };
    }

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('get_range_config failed', { args, error: errorMessage });
    
    return {
      success: false,
      user: user || 'current user',
      example: example,
      error: errorMessage,
      message: `Failed to get range configuration: ${errorMessage}`
    };
  }
}

/**
 * Smart fallback search in default directories when no directory is specified
 * Now restricted to range-config-templates directory only
 */
async function handleSmartFallbackSearch(recursive: boolean, logger: Logger): Promise<any> {
  logger.info('Smart search for range configurations in ~/.ludus-mcp/range-config-templates/', { recursive });
  
  const searchDirs = getDefaultSearchDirectories();
  const allConfigs = [];
  const searchResults = [];
  
  for (const searchDir of searchDirs) {
    logger.debug('Searching directory', { directory: searchDir });
    
    try {
      // Security check
      const pathValidation = validateDirectoryPath(searchDir);
      if (!pathValidation.valid) {
        logger.warn('Skipping directory due to security restriction', { 
          directory: searchDir, 
          error: pathValidation.error 
        });
        continue;
      }

      // Check if directory exists
      if (!fs.existsSync(searchDir)) {
        logger.debug('Directory does not exist, skipping', { directory: searchDir });
        searchResults.push({
          directory: searchDir,
          found: false,
          reason: 'Directory does not exist'
        });
        continue;
      }

      const result = await searchDirectoryForConfigs(searchDir, recursive, logger);
      
      if (result.success && result.configs.length > 0) {
        // Found configs in this directory
        allConfigs.push(...result.configs);
        searchResults.push({
          directory: searchDir,
          found: true,
          count: result.configs.length
        });
      } else {
        searchResults.push({
          directory: searchDir,
          found: false,
          reason: 'No configurations found'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Error searching directory', { directory: searchDir, error: errorMessage });
      searchResults.push({
        directory: searchDir,
        found: false,
        reason: `Error: ${errorMessage}`
      });
    }
  }

  // Sort all configs by directory then relative path
  allConfigs.sort((a, b) => {
    const dirA = path.dirname(a.filePath);
    const dirB = path.dirname(b.filePath);
    if (dirA !== dirB) {
      return dirA.localeCompare(dirB);
    }
    return a.relativePath.localeCompare(b.relativePath);
  });

  logger.info('Smart fallback search completed', {
    totalConfigs: allConfigs.length,
    searchResults
  });

  return {
    success: true,
    smartSearch: true,
    searchResults,
    configs: allConfigs,
    totalCount: allConfigs.length,
    validCount: allConfigs.filter(c => c.validation.valid).length,
    message: allConfigs.length > 0 
      ? `Found ${allConfigs.length} range configuration${allConfigs.length === 1 ? '' : 's'} across ${searchResults.filter(r => r.found).length} director${searchResults.filter(r => r.found).length === 1 ? 'y' : 'ies'}\n\n*** IMPORTANT: Use relative paths only (e.g., "base-configs/file.yml", "user1/config.yaml") - do not use ~/.ludus-mcp/ or absolute paths ***`
      : `No range configurations found in any default directories\n\n*** IMPORTANT: Use relative paths only (e.g., "base-configs", "user1") - do not use ~/.ludus-mcp/ or absolute paths ***`
  };
}

/**
 * Search a specific directory for range configurations
 */
async function searchDirectoryForConfigs(targetDirectory: string, recursive: boolean, logger: Logger): Promise<any> {
  // Find YAML files (recursively if requested)
  const yamlFilePaths = findYamlFilesRecursively(targetDirectory, recursive);

  if (yamlFilePaths.length === 0) {
    return {
      success: true,
      directory: targetDirectory,
      recursive,
      configs: [],
      totalCount: 0,
      message: `No range configuration files found in ${targetDirectory}${recursive ? ' (including subdirectories)' : ''}`
    };
  }

  // Process each YAML file
  const configs = [];
  for (const filePath of yamlFilePaths) {
    const filename = path.basename(filePath);
    const relativePath = path.relative(targetDirectory, filePath);
    
    try {
      // Get file stats
      const fileStats = fs.statSync(filePath);
      const sizeKB = (fileStats.size / 1024).toFixed(1);
      
      // Read and validate the file
      const content = fs.readFileSync(filePath, 'utf8');
      let validation;
      
      try {
        const parsedConfig = yaml.load(content);
        validation = await validateLudusRangeSchema(parsedConfig, logger);
      } catch (yamlError) {
        validation = {
          valid: false,
          errors: [`Invalid YAML syntax: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`],
          warnings: []
        };
      }

      // Determine status icon and message
      let status, statusMessage;
      if (validation.valid && validation.warnings.length === 0) {
        status = '';
        statusMessage = 'Valid';
      } else if (validation.valid && validation.warnings.length > 0) {
        status = '';
        statusMessage = `Valid (${validation.warnings.length} warning${validation.warnings.length === 1 ? '' : 's'})`;
      } else {
        status = '';
        statusMessage = `Invalid (${validation.errors.length} error${validation.errors.length === 1 ? '' : 's'})`;
      }

      configs.push({
        filename,
        filePath,
        relativePath: recursive ? relativePath : filename, // Show relative path for recursive scans
        sizeKB: `${sizeKB}KB`,
        status,
        statusMessage,
        validation,
        lastModified: fileStats.mtime.toISOString()
      });

      logger.debug('Processed config file', { 
        filePath, 
        valid: validation.valid, 
        errors: validation.errors.length,
        warnings: validation.warnings.length 
      });

    } catch (fileError) {
      const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
      configs.push({
        filename,
        filePath,
        relativePath: recursive ? path.relative(targetDirectory, filePath) : filename,
        sizeKB: 'N/A',
        status: '💥',
        statusMessage: 'Read Error',
        validation: {
          valid: false,
          errors: [`Failed to read file: ${errorMessage}`],
          warnings: []
        },
        lastModified: 'N/A'
      });

      logger.warn('Failed to process config file', { filePath, error: errorMessage });
    }
  }

  // Sort by relative path for better organization
  configs.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  logger.info('Range config search completed', {
    directory: targetDirectory,
    recursive,
    totalFiles: yamlFilePaths.length,
    validConfigs: configs.filter(c => c.validation.valid).length
  });

  return {
    success: true,
    directory: targetDirectory,
    recursive,
    configs,
    totalCount: configs.length,
    validCount: configs.filter(c => c.validation.valid).length,
    message: `Found ${configs.length} range configuration${configs.length === 1 ? '' : 's'} in ${targetDirectory}${recursive ? ' (including subdirectories)' : ''}\n\n*** IMPORTANT: Use relative paths only (e.g., "base-configs/file.yml", "user1/config.yaml") - do not use ~/.ludus-mcp/ or absolute paths ***`
  };
} 
