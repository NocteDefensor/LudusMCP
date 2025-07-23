import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

const LudusEnvironmentGuidesSchema = z.object({
  action: z.enum(['search', 'read', 'list']).describe('Action to perform: search guides content, read specific guide, or list available guides'),
  search_query: z.string().optional().describe('Text to search for in environment guides (case-insensitive)'),
  guide_name: z.string().optional().describe('Specific guide file to read (e.g., "basic-ad-network.md")'),
  max_results: z.number().optional().default(10).describe('Maximum number of search results to return (default: 10)'),
});

export function createLudusEnvironmentGuidesSearchTool(logger: Logger, ludusCliWrapper: LudusCliWrapper) {
  return {
    name: 'ludus_environment_guides_search',
    description: `**ENVIRONMENT GUIDES SHORTCUT** - Direct Access to Ludus Environment Setup Guides

**SPECIALIZED TOOL** for immediate access to complete lab environment setup guides without broad searching.

**DIRECT ACCESS TO:**
- Active Directory network setups
- Malware analysis environments
- SCCM lab configurations
- Kubernetes and container environments
- Windows and Linux lab setups
- Network topology examples
- VM specifications and requirements

**ACTIONS:**
- \`search\`: Search within all environment guides for specific terms
- \`read\`: Read a specific environment guide completely
- \`list\`: List all available environment guide files

**Usage Examples:**
- Find AD guides: \`{"action": "search", "search_query": "Active Directory"}\`
- Read specific guide: \`{"action": "read", "guide_name": "basic-ad-network.md"}\`
- List all guides: \`{"action": "list"}\`

**PERFECT FOR:**
- Range planning (ludus_range_planner step 3-4)
- Environment architecture research
- Understanding deployment patterns
- VM and networking requirements

**📍 TARGET**: Focuses specifically on \`docs/environment-guides/\` directory and all contained guides.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'read', 'list'],
          description: 'Action to perform: search guides content, read specific guide, or list available guides'
        },
        search_query: {
          type: 'string',
          description: 'Text to search for in environment guides (case-insensitive)'
        },
        guide_name: {
          type: 'string',
          description: 'Specific guide file to read (e.g., "basic-ad-network.md")'
        },
        max_results: {
          type: 'number',
          default: 10,
          description: 'Maximum number of search results to return (default: 10)'
        }
      },
      required: ['action']
    },
  };
}

export async function handleLudusEnvironmentGuidesSearch(
  args: z.infer<typeof LudusEnvironmentGuidesSchema>,
  logger: Logger,
  ludusCliWrapper: LudusCliWrapper
): Promise<{ content: Array<{ type: string; text: string }> }> {
  logger.info('Ludus environment guides search requested', { action: args.action, query: args.search_query });

  const ludusConfigDir = path.join(os.homedir(), '.ludus-mcp');
  const docsDir = path.join(ludusConfigDir, 'docs');
  const guidesDir = path.join(docsDir, 'environment-guides');

  // Check if docs directory exists
  try {
    await fs.access(guidesDir);
  } catch {
    return {
      content: [{
        type: 'text',
        text: `Environment guides not available. The directory was not found at ${guidesDir}.\n\nTry restarting the MCP server to download the documentation.`
      }]
    };
  }

  try {
    switch (args.action) {
      case 'list':
        return await handleListGuides(guidesDir, logger);
      
      case 'search':
        if (!args.search_query) {
          return {
            content: [{
              type: 'text',
              text: 'Search query is required when action is "search"'
            }]
          };
        }
        return await handleSearchGuides(guidesDir, args.search_query, args.max_results, logger);
      
      case 'read':
        if (!args.guide_name) {
          return {
            content: [{
              type: 'text',
              text: 'Guide name is required when action is "read". Use "list" action to see available guides.'
            }]
          };
        }
        return await handleReadGuide(guidesDir, args.guide_name, logger);
      
      default:
        return {
          content: [{
            type: 'text',
            text: 'Invalid action. Use "search", "read", or "list"'
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Ludus environment guides search failed', { error: errorMessage, args });
    
    return {
      content: [{
        type: 'text',
        text: `Error accessing environment guides: ${errorMessage}`
      }]
    };
  }
}

async function handleListGuides(guidesDir: string, logger: Logger) {
  try {
    const files = await fs.readdir(guidesDir);
    const guideFiles = files.filter(file => file.endsWith('.md') || file.endsWith('.mdx'));
    
    if (guideFiles.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No environment guide files found in ${guidesDir}`
        }]
      };
    }
    
    // Try to get brief description from each file
    const guidesWithDescriptions = await Promise.all(
      guideFiles.map(async (file) => {
        try {
          const filePath = path.join(guidesDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          // Look for title or first non-empty line as description
          let description = 'Environment setup guide';
          for (const line of lines.slice(0, 10)) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) {
              description = trimmed.replace('# ', '');
              break;
            }
            if (trimmed.length > 20 && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
              description = trimmed.length > 80 ? trimmed.substring(0, 80) + '...' : trimmed;
              break;
            }
          }
          
          return `• **${file}** - ${description}`;
        } catch {
          return `• **${file}** - Environment setup guide`;
        }
      })
    );
    
    return {
      content: [{
        type: 'text',
        text: `**ENVIRONMENT GUIDES AVAILABLE** (${guideFiles.length} guides)\n\n${guidesWithDescriptions.join('\n')}\n\nUse \`{"action": "read", "guide_name": "filename.md"}\` to read a specific guide.`
      }]
    };
  } catch (error) {
    logger.error('Failed to list guides', { error });
    return {
      content: [{
        type: 'text',
        text: `Could not list guide files: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}

async function handleSearchGuides(guidesDir: string, query: string, maxResults: number, logger: Logger) {
  try {
    const files = await fs.readdir(guidesDir);
    const guideFiles = files.filter(file => file.endsWith('.md') || file.endsWith('.mdx'));
    
    const queryLower = query.toLowerCase();
    const allMatches: Array<{file: string, lineNumber: number, content: string, context: string}> = [];
    
    for (const file of guideFiles) {
      const filePath = path.join(guidesDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(queryLower)) {
          // Get context around the match
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(lines.length - 1, i + 2);
          const context = lines.slice(contextStart, contextEnd + 1).join('\n').trim();
          
          allMatches.push({
            file,
            lineNumber: i + 1,
            content: line.trim(),
            context: context.length > 250 ? context.substring(0, 250) + '...' : context
          });
          
          if (allMatches.length >= maxResults) break;
        }
      }
      
      if (allMatches.length >= maxResults) break;
    }
    
    if (allMatches.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `**NO MATCHES** for "${query}" in environment guides.\n\nTry searching for:\n• Environment types (e.g., "AD", "malware", "kubernetes")\n• Technologies (e.g., "windows", "linux", "sccm")\n• Setup terms (e.g., "install", "configure", "deploy")`
        }]
      };
    }
    
    const resultText = allMatches.map((match, index) => 
      `**[${index + 1}] ${match.file} - Line ${match.lineNumber}:**\n\`${match.content}\`\n\n**Context:**\n${match.context}\n`
    ).join('\n---\n\n');
    
    return {
      content: [{
        type: 'text',
        text: `**ENVIRONMENT GUIDES SEARCH RESULTS** for "${query}" (${allMatches.length} matches)\n\n${resultText}`
      }]
    };
  } catch (error) {
    logger.error('Failed to search guides', { error, query });
    return {
      content: [{
        type: 'text',
        text: `Could not search environment guides: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}

async function handleReadGuide(guidesDir: string, guideName: string, logger: Logger) {
  try {
    const filePath = path.join(guidesDir, guideName);
    const content = await fs.readFile(filePath, 'utf-8');
    
    return {
      content: [{
        type: 'text',
        text: `**ENVIRONMENT GUIDE: ${guideName}**\n\n${content}\n\n---\n\n**Tip**: Use \`{"action": "search", "search_query": "term"}\` to find specific information across all guides.`
      }]
    };
  } catch (error) {
    logger.error('Failed to read guide', { error, guideName });
    return {
      content: [{
        type: 'text',
        text: `Could not read guide "${guideName}": ${error instanceof Error ? error.message : String(error)}\n\nUse \`{"action": "list"}\` to see available guide files.`
      }]
    };
  }
} 