import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as yaml from 'js-yaml';

export const ludusReadRoleCollectionSchemaTool: Tool = {
  name: 'ludus_read_role_collection_schema',
  description: '**ROLE SCHEMA REFERENCE** - Reads all Ludus role and collection schemas from individual YAML files. Returns comprehensive role data including variables, descriptions, dependencies, and GitHub repositories. Essential for range planning and configuration validation.',
  inputSchema: {
    type: 'object',
    properties: {
      help: {
        type: 'boolean',
        description: 'Show help information about available roles and collections',
        default: false
      }
    }
  }
};

/**
 * Load all YAML schema files from the schemas directory and aggregate them
 */
async function loadAllYamlSchemas(schemaDir: string): Promise<any> {
  const aggregatedSchema = {
    ludus_roles_schema: {
      roles: {} as Record<string, any>,
      collections: {} as Record<string, any>,
      metadata: {
        total_files: 0,
        total_roles: 0,
        total_collections: 0,
        last_updated: new Date().toISOString(),
        source_files: [] as string[]
      }
    }
  };

  try {
    // Read all files in the schemas directory
    const files = await fs.readdir(schemaDir);
    const yamlFiles = files.filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml')
    );

    if (yamlFiles.length === 0) {
      throw new Error('No YAML schema files found in schemas directory');
    }

    // Process each YAML file
    for (const file of yamlFiles) {
      try {
        const filePath = path.join(schemaDir, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedYaml = yaml.load(fileContent) as any;

        if (!parsedYaml || typeof parsedYaml !== 'object') {
          console.warn(`Skipping invalid YAML file: ${file}`);
          continue;
        }

        // Determine if it's a role or collection based on type field
        const itemType = parsedYaml.type || 'role'; // Default to role if not specified
        const itemName = parsedYaml.name || path.basename(file, path.extname(file));

        if (itemType === 'collection') {
          aggregatedSchema.ludus_roles_schema.collections[itemName] = {
            ...parsedYaml,
            source_file: file
          };
          aggregatedSchema.ludus_roles_schema.metadata.total_collections++;
        } else {
          aggregatedSchema.ludus_roles_schema.roles[itemName] = {
            ...parsedYaml,
            source_file: file
          };
          aggregatedSchema.ludus_roles_schema.metadata.total_roles++;
        }

        aggregatedSchema.ludus_roles_schema.metadata.source_files.push(file);
        aggregatedSchema.ludus_roles_schema.metadata.total_files++;

      } catch (fileError) {
        console.warn(`Error processing YAML file ${file}:`, fileError);
        // Continue processing other files
      }
    }

    return aggregatedSchema;

  } catch (error) {
    throw new Error(`Failed to load YAML schemas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function handleLudusReadRoleCollectionSchema(args: any): Promise<CallToolResult> {
  try {
    const { help = false } = args;

    if (help) {
      return {
        content: [
          {
            type: 'text',
            text: `**LUDUS ROLE COLLECTION SCHEMA TOOL**

**PURPOSE:**
Reads all Ludus role and collection schemas from individual YAML files in ~/.ludus-mcp/schemas/

**WHAT IT RETURNS:**
- Complete inventory of all available Ludus roles and collections
- Role variables, types, and requirements for each role
- Collection definitions with bundled roles
- GitHub repository links and documentation
- Author information and version details

**FILE STRUCTURE:**
~/.ludus-mcp/schemas/
├── ludus_ad.yaml
├── ludus_sccm.yaml  
├── domain_controller_collection.yaml
└── monitoring_stack.yaml

**USAGE:**
- Use during range planning to understand available roles
- Verify role variables before writing configurations  
- Research role capabilities and requirements
- Find GitHub repositories for detailed documentation

**NOTE:** 
This tool reads ALL YAML schema files and returns complete data. No filtering is applied - you get everything in one comprehensive response.`
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
            text: `Error: Schemas directory not found at ${schemaDir}. Please ensure YAML schema files have been downloaded from GitHub during server initialization.`
          }
        ],
        isError: true
      };
    }

    // Load all YAML schemas
    const aggregatedSchema = await loadAllYamlSchemas(schemaDir);

    // Return the complete aggregated schema
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(aggregatedSchema, null, 2)
        }
      ]
    };

  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error reading role schemas: ${error.message}\n\nTroubleshooting:\n- Restart the MCP server to reinitialize schemas\n- Check that YAML files exist in ~/.ludus-mcp/schemas/\n- Verify YAML file syntax is valid\n- Ensure file system permissions allow reading`
        }
      ],
      isError: true
    };
  }
} 