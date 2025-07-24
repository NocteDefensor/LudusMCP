import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as yaml from 'js-yaml';

export const ludusReadRoleCollectionSchemaTool: Tool = {
  name: 'ludus_read_role_collection_schema',
  description: '**ROLE SCHEMA REFERENCE** - Reads Ludus role and collection schemas from individual YAML files. Returns comprehensive role data including variables, descriptions, dependencies, and GitHub repositories. Essential for range planning and configuration validation.',
  inputSchema: {
    type: 'object',
    properties: {
      help: {
        type: 'boolean',
        description: 'Show help information about available roles and collections',
        default: false
      },
      file_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of specific YAML file names to read (e.g., ["ludus_ad.yaml", "sccm_collection.yaml"]). If omitted, reads all YAML files in the schemas directory.'
      }
    }
  }
};

/**
 * Load all YAML schema files from the schemas directory and aggregate them
 */
async function loadAllYamlSchemas(schemaDir: string, fileNamesFilter?: string[]): Promise<any> {
  const aggregatedSchema = {
    ludus_roles_schema: {
      roles: {} as Record<string, any>,
      collections: {} as Record<string, any>,
      metadata: {
        total_files: 0,
        total_roles: 0,
        total_collections: 0,
        last_updated: new Date().toISOString(),
        source_files: [] as string[],
        filtered: fileNamesFilter ? true : false,
        requested_files: fileNamesFilter || []
      }
    }
  };

  try {
    // Read all files in the schemas directory
    const files = await fs.readdir(schemaDir);
    let yamlFiles = files.filter(file => 
      file.endsWith('.yaml') || file.endsWith('.yml')
    );

    // Apply file name filter if provided
    if (fileNamesFilter && fileNamesFilter.length > 0) {
      yamlFiles = yamlFiles.filter(file => fileNamesFilter.includes(file));
      
      // Check for any requested files that weren't found
      const missingFiles = fileNamesFilter.filter(requested => 
        !yamlFiles.includes(requested)
      );
      
      if (missingFiles.length > 0) {
        throw new Error(`Requested files not found: ${missingFiles.join(', ')}. Available files: ${files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).join(', ')}`);
      }
    }

    if (yamlFiles.length === 0) {
      if (fileNamesFilter && fileNamesFilter.length > 0) {
        throw new Error(`No matching YAML files found for filter: ${fileNamesFilter.join(', ')}`);
      } else {
        throw new Error('No YAML schema files found in schemas directory');
      }
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
    const { help = false, file_names } = args;

    if (help) {
      return {
        content: [
          {
            type: 'text',
            text: `**LUDUS ROLE COLLECTION SCHEMA TOOL**

**PURPOSE:**
Reads Ludus role and collection schemas from individual YAML files. Essential reference for range planning and configuration validation.

**WHAT IT RETURNS:**
- Complete inventory of available Ludus roles and collections
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

**USAGE OPTIONS:**

1. **Read All Schemas (Default):**
   \`ludus_read_role_collection_schema\`
   - Returns complete data from all YAML files

2. **Read Specific Files:**
   \`ludus_read_role_collection_schema file_names=["ludus_ad.yaml", "sccm_collection.yaml"]\`
   - Returns data only from specified files
   - Faster when you need specific roles/collections
   - Exact file names required (including .yaml/.yml extension)

**FILE NAME EXAMPLES:**
- "ludus_child_domain.yaml"
- "badsectorlabs.ludus_vulhub.yaml" 
- "synzack.ludus_sccm.yaml"
- "Sample-schema.yaml"

**TIPS:**
- Use \`ludus_list_role_collection_schemas\` first to see available files
- File names are case-sensitive and must include extension
- Mix and match roles and collections in file_names array
- Error messages will show available files if names don't match`
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

    // Load YAML schemas (all or filtered)
    const aggregatedSchema = await loadAllYamlSchemas(schemaDir, file_names);

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
          text: `Error reading role schemas: ${error.message}\n\nTroubleshooting:\n- Restart the MCP server to reinitialize schemas\n- Check that YAML files exist in ~/.ludus-mcp/schemas/\n- Verify YAML file syntax is valid\n- Ensure file system permissions allow reading\n- Use exact file names with extensions (e.g., "ludus_ad.yaml")\n- Use ludus_list_role_collection_schemas to see available files`
        }
      ],
      isError: true
    };
  }
} 