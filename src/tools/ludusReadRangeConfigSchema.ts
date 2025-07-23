import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface RangeConfigSchemaSearch {
  search_terms?: string[];
  include_full_schema?: boolean;
  section_filter?: string[];
}

export const ludusReadRangeConfigSchemaTool: Tool = {
  name: 'ludus_read_range_config_schema',
  description: '**RANGE CONFIG SCHEMA** - Direct access to official Ludus range configuration JSON schema. Provides complete structure, validation rules, and property definitions for range configs.',
  inputSchema: {
    type: 'object',
    properties: {
      search_terms: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of terms to search for within the schema (case-insensitive partial matches)'
      },
      include_full_schema: {
        type: 'boolean',
        description: 'If true, returns the complete schema. If false and search_terms provided, returns filtered results.',
        default: false
      },
      section_filter: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['properties', 'definitions', 'required', 'examples', 'enum']
        },
        description: 'Filter to specific schema sections (properties, definitions, required, examples, enum)'
      }
    }
  }
};

export async function handleLudusReadRangeConfigSchema(args: any): Promise<CallToolResult> {
  try {
    // Try to read the schema file
    const homeDir = os.homedir();
    const schemaFilePath = path.join(homeDir, '.ludus-mcp', 'schemas', 'range-config.json');
    
    let schemaContent;
    try {
      const fileContent = await fs.readFile(schemaFilePath, 'utf-8');
      schemaContent = JSON.parse(fileContent);
    } catch (fileError) {
      return {
        content: [
          {
            type: 'text',
            text: `**Range Config Schema Not Available**

Could not read the range configuration schema from: ${schemaFilePath}

**Error**: ${fileError instanceof Error ? fileError.message : String(fileError)}

**To Fix**:
1. Restart the MCP server to trigger schema download
2. Check your internet connection (schema is downloaded from docs.ludus.cloud)
3. Verify the ~/.ludus-mcp/schemas/ directory exists

**Alternative**: Use the \`validate_range_config\` tool which has built-in schema validation.`
          }
        ]
      };
    }

    const { search_terms, include_full_schema = false, section_filter } = args;

    // If full schema requested or no filters, return everything
    if (include_full_schema || (!search_terms && !section_filter)) {
      return {
        content: [
          {
            type: 'text',
            text: `**LUDUS RANGE CONFIG SCHEMA** (Complete)

**Source**: ${schemaFilePath}
**Schema Version**: ${schemaContent.$schema || 'Unknown'}
**Title**: ${schemaContent.title || 'Ludus Range Configuration'}

\`\`\`json
${JSON.stringify(schemaContent, null, 2)}
\`\`\`

**Tips**:
- Use \`search_terms\` to find specific properties
- Use \`section_filter\` to focus on specific parts
- Check \`required\` arrays for mandatory fields
- Look at \`enum\` values for valid options`
          }
        ]
      };
    }

    // Apply filtering
    let filteredContent: any = {};
    let resultsFound = 0;

    // Section filtering
    if (section_filter && section_filter.length > 0) {
      for (const section of section_filter) {
        if (schemaContent[section]) {
          filteredContent[section] = schemaContent[section];
          resultsFound++;
        }
      }
    } else {
      filteredContent = schemaContent;
    }

    // Search terms filtering
    if (search_terms && search_terms.length > 0) {
      const searchResults = searchInSchema(filteredContent, search_terms);
      
      if (searchResults.matches.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**NO MATCHES** for search terms: ${search_terms.join(', ')}

**Searched in**: Range config schema
**Suggestions**:
- Try broader terms like: "ludus", "network", "windows", "roles", "defaults"
- Check property names like: "vm_name", "hostname", "template", "cpus", "ram_gb"
- Look for validation terms like: "required", "enum", "type", "minimum", "maximum"

**Use \`include_full_schema: true\` to see the complete schema structure.**`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `**RANGE CONFIG SCHEMA SEARCH** (${search_terms.join(', ')})

**Found ${searchResults.matches.length} matches:**

${searchResults.matches.map((match, index) => 
  `**[${index + 1}] ${match.path}**\n\`\`\`json\n${JSON.stringify(match.value, null, 2)}\n\`\`\``
).join('\n\n')}

${searchResults.context.length > 0 ? `\n**Related Context:**\n${searchResults.context.join('\n')}` : ''}

**Tips**:
- Use exact property names for precise matches
- Check \`enum\` arrays for valid values
- Look at \`description\` fields for usage guidance`
          }
        ]
      };
    }

    // Section filter only (no search terms)
    return {
      content: [
        {
          type: 'text',
          text: `**RANGE CONFIG SCHEMA** (${section_filter?.join(', ') || 'Filtered'})

\`\`\`json
${JSON.stringify(filteredContent, null, 2)}
\`\`\`

**Use search_terms to find specific properties within these sections.**`
        }
      ]
    };

  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `**Schema Read Error**: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

function searchInSchema(schema: any, searchTerms: string[]): { matches: Array<{path: string, value: any}>, context: string[] } {
  const matches: Array<{path: string, value: any}> = [];
  const context: string[] = [];
  
  function searchRecursive(obj: any, currentPath: string = '') {
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = currentPath ? `${currentPath}.${key}` : key;
        
        // Check if key or value matches any search term
        const keyMatches = searchTerms.some(term => 
          key.toLowerCase().includes(term.toLowerCase())
        );
        
        const valueMatches = searchTerms.some(term => {
          if (typeof value === 'string') {
            return value.toLowerCase().includes(term.toLowerCase());
          }
          return false;
        });
        
        if (keyMatches || valueMatches) {
          matches.push({ path: newPath, value });
          
          // Add context if it's a description or has useful metadata
          if (typeof value === 'object' && value !== null && 'description' in value && typeof value.description === 'string') {
            context.push(`${newPath}: ${value.description}`);
          }
        }
        
        // Recurse into nested objects
        if (typeof value === 'object') {
          searchRecursive(value, newPath);
        }
      }
    }
  }
  
  searchRecursive(schema);
  return { matches: matches.slice(0, 20), context: context.slice(0, 5) }; // Limit results
} 