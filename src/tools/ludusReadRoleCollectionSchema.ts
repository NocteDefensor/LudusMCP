import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface RoleSchemaSearch {
  role_names?: string[];
  variable_names?: string[];
  descriptions?: string[];
  authors?: string[];
  types?: string[];
}

export const ludusReadRoleCollectionSchemaTool: Tool = {
  name: 'ludus_read_role_collection_schema',
  description: '**ROLE SCHEMA REFERENCE** - Supporting tool to search the comprehensive Ludus role collection schema. NOT for primary range planning - use ludus_range_planner FIRST for range creation! This tool provides detailed role/variable lookups for research and validation phases.',
  inputSchema: {
    type: 'object',
    properties: {
      search_filters: {
        type: 'object',
        description: 'Optional filters to search the schema',
        properties: {
          role_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of role names to search for (partial matches)'
          },
          variable_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of variable names to search for (partial matches)'
          },
          descriptions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of description keywords to search for'
          },
          authors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of author names to search for'
          },
          types: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of types to filter by (role, collection)'
          }
        }
      },
      include_full_schema: {
        type: 'boolean',
        description: 'If true, returns the full schema without filtering',
        default: false
      }
    }
  }
};

export async function handleLudusReadRoleCollectionSchema(args: any): Promise<CallToolResult> {
  try {
    // Read schema from downloaded file only
    const homeDir = os.homedir();
    const schemaDir = path.join(homeDir, '.ludus-mcp', 'schemas');
    const schemaFilePath = path.join(schemaDir, 'ludus-roles-collections-schema.json');
    
    let schema;
    try {
      const fileContent = await fs.readFile(schemaFilePath, 'utf-8');
      schema = JSON.parse(fileContent);
    } catch (fileError) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Schema file not found at ${schemaFilePath}. Please ensure schemas have been downloaded from GitHub during server initialization.`
          }
        ],
        isError: true
      };
    }

    const { search_filters, include_full_schema = false } = args;

    if (include_full_schema || !search_filters) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(schema, null, 2)
          }
        ]
      };
    }

    // Apply filters
    const filteredRoles: any = {};
    const roles = schema.ludus_roles_schema?.roles || {};

    for (const [roleName, roleData] of Object.entries(roles)) {
      let matchesFilters = true;

      // Filter by role names
      if (search_filters.role_names?.length > 0) {
        const nameMatch = search_filters.role_names.some((searchName: string) =>
          roleName.toLowerCase().includes(searchName.toLowerCase())
        );
        if (!nameMatch) matchesFilters = false;
      }

      // Filter by authors
      if (search_filters.authors?.length > 0 && matchesFilters) {
        const authorMatch = search_filters.authors.some((searchAuthor: string) =>
          (roleData as any).author?.toLowerCase().includes(searchAuthor.toLowerCase())
        );
        if (!authorMatch) matchesFilters = false;
      }

      // Filter by types
      if (search_filters.types?.length > 0 && matchesFilters) {
        const roleType = (roleData as any).type || 'role';
        const typeMatch = search_filters.types.some((searchType: string) =>
          roleType.toLowerCase() === searchType.toLowerCase()
        );
        if (!typeMatch) matchesFilters = false;
      }

      // Filter by descriptions
      if (search_filters.descriptions?.length > 0 && matchesFilters) {
        const descMatch = search_filters.descriptions.some((searchDesc: string) =>
          (roleData as any).description?.toLowerCase().includes(searchDesc.toLowerCase())
        );
        if (!descMatch) matchesFilters = false;
      }

      // Filter by variable names
      if (search_filters.variable_names?.length > 0 && matchesFilters) {
        const variables = (roleData as any).variables || {};
        const roles = (roleData as any).roles || {};
        
        let varMatch = false;
        
        // Check direct variables
        for (const varName of Object.keys(variables)) {
          if (search_filters.variable_names.some((searchVar: string) =>
            varName.toLowerCase().includes(searchVar.toLowerCase())
          )) {
            varMatch = true;
            break;
          }
        }
        
        // Check collection sub-role variables
        if (!varMatch) {
          for (const subRole of Object.values(roles)) {
            const subVars = (subRole as any).variables || {};
            for (const varName of Object.keys(subVars)) {
              if (search_filters.variable_names.some((searchVar: string) =>
                varName.toLowerCase().includes(searchVar.toLowerCase())
              )) {
                varMatch = true;
                break;
              }
            }
            if (varMatch) break;
          }
        }
        
        if (!varMatch) matchesFilters = false;
      }

      if (matchesFilters) {
        filteredRoles[roleName] = roleData;
      }
    }

    const filteredSchema = {
      ...schema,
      ludus_roles_schema: {
        ...schema.ludus_roles_schema,
        roles: filteredRoles,
        filtered_count: Object.keys(filteredRoles).length,
        total_roles: Object.keys(roles).length
      }
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(filteredSchema, null, 2)
        }
      ]
    };

  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error reading role schema: ${error.message}`
        }
      ],
      isError: true
    };
  }
} 