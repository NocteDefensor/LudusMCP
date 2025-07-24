import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger.js';

export async function handleLudusListRoleCollectionSchemas(args: any, logger: Logger): Promise<CallToolResult> {
  try {
    const { help = false } = args;

    if (help) {
      return {
        content: [
          {
            type: 'text',
            text: `**LUDUS LIST ROLE COLLECTION SCHEMAS TOOL**

**PURPOSE:**
Lists all available Ludus role and collection schema files in ~/.ludus-mcp/schemas/

**WHAT IT RETURNS:**
- Complete inventory of all schema files (.yaml and .yml)
- File sizes and basic metadata
- Separation of roles vs collections
- File status and accessibility

**FILE STRUCTURE:**
~/.ludus-mcp/schemas/
├── badsectorlabs.ludus_vulhub.yaml
├── synzack.ludus_sccm.yaml (collection)
├── ludus_child_domain.yaml
└── Sample-schema.yaml (template)

**USAGE:**
- Use before reading specific schemas to see what's available
- Get overview of role/collection inventory
- Verify schema files have been downloaded properly
- Find specific roles by name pattern

**OUTPUT:**
Lists all .yaml and .yml files with file information, separated by type (roles, collections, templates).`
          }
        ]
      };
    }

    // Read schemas from YAML files
    const homeDir = os.homedir();
    const schemaDir = path.join(homeDir, '.ludus-mcp', 'schemas');
    
    // Check if schemas directory exists
    try {
      await fs.access(schemaDir);
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: `**Error: Schemas directory not found**

Schemas directory not found at: ${schemaDir}

**To Fix:**
1. Restart the MCP server to trigger schema download from GitHub
2. Check your internet connection
3. Verify the ~/.ludus-mcp/ directory exists

**Expected Location:** ~/.ludus-mcp/schemas/`
          }
        ],
        isError: true
      };
    }

    // Get all YAML/YML files
    const schemaFiles = await findYamlSchemaFiles(schemaDir);
    
    if (schemaFiles.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `**No Schema Files Found**

Directory exists but no .yaml or .yml files found in: ${schemaDir}

**To Fix:**
1. Restart the MCP server to download schemas from GitHub
2. Check that the 'yaml-schemas' branch exists in the repository
3. Verify your internet connection

**Expected Files:** Role and collection schema files with .yaml or .yml extensions`
          }
        ]
      };
    }

    // Process files and categorize
    const roles: SchemaFileInfo[] = [];
    const collections: SchemaFileInfo[] = [];
    const templates: SchemaFileInfo[] = [];
    const unknown: SchemaFileInfo[] = [];

    for (const filePath of schemaFiles) {
      try {
        const stats = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        const fileSize = formatFileSize(stats.size);
        
        // Read first few lines to determine type
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').slice(0, 10);
        
        let type = 'unknown';
        let name = fileName.replace(/\.(yaml|yml)$/, '');
        
        // Parse type and name from YAML
        for (const line of lines) {
          if (line.startsWith('name:')) {
            name = line.replace('name:', '').trim();
          }
          if (line.startsWith('type:')) {
            type = line.replace('type:', '').trim().replace(/['"#]/g, '').split(' ')[0];
          }
        }

        const fileInfo: SchemaFileInfo = {
          fileName,
          name,
          type,
          size: fileSize,
          sizeBytes: stats.size,
          lastModified: stats.mtime.toISOString().split('T')[0],
          path: filePath
        };

        // Categorize files
        if (fileName.includes('Sample-schema') || fileName.includes('template')) {
          templates.push(fileInfo);
        } else if (type === 'collection') {
          collections.push(fileInfo);
        } else if (type === 'role') {
          roles.push(fileInfo);
        } else {
          unknown.push(fileInfo);
        }
      } catch (error) {
        logger.warn('Failed to process schema file', { filePath, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // Sort arrays by name
    roles.sort((a, b) => a.name.localeCompare(b.name));
    collections.sort((a, b) => a.name.localeCompare(b.name));
    templates.sort((a, b) => a.name.localeCompare(b.name));
    unknown.sort((a, b) => a.name.localeCompare(b.name));

    // Generate summary report
    const totalFiles = roles.length + collections.length + templates.length + unknown.length;
    const totalSize = [...roles, ...collections, ...templates, ...unknown]
      .reduce((sum, file) => sum + file.sizeBytes, 0);

    let report = `**LUDUS ROLE/COLLECTION SCHEMAS INVENTORY**

**📊 Summary:**
- **Total Files:** ${totalFiles}
- **Total Size:** ${formatFileSize(totalSize)}
- **Location:** ${schemaDir}
- **Last Scan:** ${new Date().toISOString().split('T')[0]}

`;

    if (roles.length > 0) {
      report += `**🎯 Individual Roles (${roles.length}):**
`;
      for (const role of roles) {
        report += `- **${role.name}** (${role.size}) - ${role.fileName}\n`;
      }
      report += '\n';
    }

    if (collections.length > 0) {
      report += `**📦 Collections (${collections.length}):**
`;
      for (const collection of collections) {
        report += `- **${collection.name}** (${collection.size}) - ${collection.fileName}\n`;
      }
      report += '\n';
    }

    if (templates.length > 0) {
      report += `**📋 Templates (${templates.length}):**
`;
      for (const template of templates) {
        report += `- **${template.name}** (${template.size}) - ${template.fileName}\n`;
      }
      report += '\n';
    }

    if (unknown.length > 0) {
      report += `**❓ Unknown Type (${unknown.length}):**
`;
      for (const file of unknown) {
        report += `- **${file.name}** (${file.size}) - ${file.fileName}\n`;
      }
      report += '\n';
    }

    report += `**🔧 Next Steps:**
- Use \`ludus_read_role_collection_schema\` to read all schema data
- Use \`ludus_read_role_collection_schema\` with help=true for detailed usage
- Individual files are also available for direct reading if needed

**📁 File Extensions:** Both .yaml and .yml files are supported`;

    return {
      content: [
        {
          type: 'text',
          text: report
        }
      ]
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to list role collection schemas', { error: errorMessage });
    
    return {
      content: [
        {
          type: 'text',
          text: `**Error listing role collection schemas**

${errorMessage}

**Troubleshooting:**
1. Check that ~/.ludus-mcp/schemas/ directory exists
2. Restart MCP server to download schemas
3. Verify internet connection for GitHub downloads`
        }
      ],
      isError: true
    };
  }
}

/**
 * Find all YAML schema files (.yaml and .yml) in a directory
 */
async function findYamlSchemaFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isFile() && (item.name.endsWith('.yaml') || item.name.endsWith('.yml'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files.sort();
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Schema file information interface
 */
interface SchemaFileInfo {
  fileName: string;
  name: string;
  type: string;
  size: string;
  sizeBytes: number;
  lastModified: string;
  path: string;
} 