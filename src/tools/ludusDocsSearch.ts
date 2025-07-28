import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';
import { getDocsStructure } from '../utils/downloadDocs.js';

// Input schema for the ludus docs tool
const LudusDocsSchema = z.object({
  action: z.enum(['search', 'read', 'list_structure']).describe('Action to perform: search content, read specific file, or list documentation structure'),
  
  // For search action
  search_query: z.string().optional().describe('Text to search for across all documentation files (case-insensitive)'),
  search_directory: z.string().optional().describe('Limit search to specific directory (e.g., "environment-guides", "quick-start")'),
  
  // For read action  
  file_path: z.string().optional().describe('Relative path to documentation file to read (e.g., "environment-guides/basic-ad-network.md")'),
  
  // General options
  max_results: z.number().optional().default(10).describe('Maximum number of search results to return (default: 10)'),
});

export function createLudusDocsSearchTool(logger: Logger, ludusCliWrapper: LudusCliWrapper) {
  return {
    name: 'ludus_docs_search',
    description: `**MCP TOOL** - Search and Read Ludus Documentation

IMPORTANT: This is a Ludus MCP server tool, NOT a Ludus CLI command. Do NOT use "ludus ludus_docs_search" - use this tool directly.

This tool provides access to the complete, up-to-date Ludus documentation that was automatically downloaded from the official repository. Use this to:

**SEARCH DOCUMENTATION:**
- Find information about specific topics, configurations, or troubleshooting
- Search across all documentation or within specific sections
- Get contextual snippets with file references

**READ SPECIFIC FILES:**
- Read complete documentation files for detailed information
- Access environment guides, quick-start guides, troubleshooting docs

**EXPLORE STRUCTURE:**
- List available documentation sections and files
- Understand the organization of Ludus documentation

**Key Documentation Sections Available:**
- \`environment-guides/\`: Complete lab setup guides (AD networks, malware analysis, SCCM, etc.)
- \`quick-start/\`: Getting started guides and basic operations
- \`troubleshooting/\`: Common issues and solutions
- \`configuration/\`: Detailed configuration options and examples

**Usage Examples:**
- Search: \`{"action": "search", "search_query": "Active Directory setup"}\`
- Read guide: \`{"action": "read", "file_path": "environment-guides/basic-ad-network.md"}\`
- List structure: \`{"action": "list_structure"}\`
- Search in section: \`{"action": "search", "search_query": "certificate", "search_directory": "environment-guides"}\`

**KNOWLEDGE BASE**: This documentation is automatically kept up-to-date with the latest Ludus features, configurations, and best practices from the official project repository.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'read', 'list_structure'],
          description: 'Action to perform: search content, read specific file, or list documentation structure'
        },
        search_query: {
          type: 'string',
          description: 'Text to search for across all documentation files (case-insensitive)'
        },
        search_directory: {
          type: 'string',
          description: 'Limit search to specific directory (e.g., "environment-guides", "quick-start")'
        },
        file_path: {
          type: 'string',
          description: 'Relative path to documentation file to read (e.g., "environment-guides/basic-ad-network.md")'
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

export async function handleLudusDocsSearch(
  args: z.infer<typeof LudusDocsSchema>,
  logger: Logger,
  ludusCliWrapper: LudusCliWrapper
): Promise<{ content: Array<{ type: string; text: string }> }> {
  logger.info('Ludus docs search requested', { action: args.action, query: args.search_query, file: args.file_path });

  const ludusConfigDir = path.join(os.homedir(), '.ludus-mcp');
  const docsDir = path.join(ludusConfigDir, 'docs');

  // Check if docs directory exists
  try {
    await fs.access(docsDir);
  } catch {
    return {
      content: [{
        type: 'text',
        text: `Documentation not available. The Ludus documentation directory was not found at ${docsDir}.\n\nThis could mean:\n1. Documentation download failed during server startup\n2. The server hasn't been restarted since adding documentation support\n3. There was a network issue during download\n\nTry restarting the MCP server to re-download the documentation.`
      }]
    };
  }

  try {
    switch (args.action) {
      case 'list_structure':
        return await handleListStructure(docsDir, logger);
      
      case 'search':
        if (!args.search_query) {
          return {
            content: [{
              type: 'text',
              text: 'Search query is required when action is "search"'
            }]
          };
        }
        return await handleSearchDocs(docsDir, args.search_query, args.search_directory, args.max_results, logger);
      
      case 'read':
        if (!args.file_path) {
          return {
            content: [{
              type: 'text',
              text: 'File path is required when action is "read"'
            }]
          };
        }
        return await handleReadDoc(docsDir, args.file_path, logger);
      
      default:
        return {
          content: [{
            type: 'text',
            text: 'Invalid action. Use "search", "read", or "list_structure"'
          }]
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Ludus docs search failed', { error: errorMessage, args });
    
    return {
      content: [{
        type: 'text',
        text: `Documentation operation failed: ${errorMessage}`
      }]
    };
  }
}

async function handleListStructure(docsDir: string, logger: Logger): Promise<{ content: Array<{ type: string; text: string }> }> {
  const structure = await getDocsStructure(logger);
  
  if (!structure) {
    return {
      content: [{
        type: 'text',
        text: 'Failed to get documentation structure'
      }]
    };
  }

  const formatStructure = (obj: any, indent: string = ''): string => {
    let result = '';
    
    // List directories first
    for (const [dirName, dirContent] of Object.entries(obj.directories || {})) {
      result += `${indent}${dirName}/\n`;
      result += formatStructure(dirContent as any, indent + '  ');
    }
    
    // Then list files
    for (const file of obj.files || []) {
      result += `${indent}${file.name}\n`;
    }
    
    return result;
  };

  const structureText = formatStructure(structure);
  const totalFiles = await countTotalFiles(structure);

  return {
    content: [{
      type: 'text',
      text: `**Ludus Documentation Structure**\n\n${structureText}\n**Total**: ${totalFiles} documentation files available\n\n**Usage Tips:**\n- Use \`read\` action with file paths like "environment-guides/basic-ad-network.md"\n- Use \`search\` action to find content across all files\n- Specify \`search_directory\` to limit search scope`
    }]
  };
}

async function handleSearchDocs(docsDir: string, query: string, searchDirectory?: string, maxResults: number = 10, logger?: Logger): Promise<{ content: Array<{ type: string; text: string }> }> {
  const searchPath = searchDirectory ? path.join(docsDir, searchDirectory) : docsDir;
  
  // Verify search path exists
  try {
    await fs.access(searchPath);
  } catch {
    return {
      content: [{
        type: 'text',
        text: `Search directory not found: ${searchDirectory || 'root'}`
      }]
    };
  }

  const results = await searchInDirectory(searchPath, query.toLowerCase(), docsDir);
  
  if (results.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No results found for "${query}"${searchDirectory ? ` in ${searchDirectory}` : ''}\n\nTry:\n- Different keywords or phrases\n- Broader search terms\n- Searching without directory restriction`
      }]
    };
  }

  // Sort by relevance (number of matches) and limit results
  results.sort((a, b) => b.matches.length - a.matches.length);
  const limitedResults = results.slice(0, maxResults);

  let output = `**Search Results for "${query}"**${searchDirectory ? ` in ${searchDirectory}` : ''}\n`;
  output += `Found ${results.length} file(s) with matches${results.length > maxResults ? ` (showing top ${maxResults})` : ''}\n\n`;

  for (const result of limitedResults) {
    output += `**${result.relativePath}**\n`;
    output += `${result.matches.length} match(es):\n\n`;
    
    for (const match of result.matches.slice(0, 3)) { // Show up to 3 matches per file
      output += `• Line ${match.lineNumber}: ${match.context}\n`;
    }
    
    if (result.matches.length > 3) {
      output += `• ... and ${result.matches.length - 3} more match(es)\n`;
    }
    output += '\n';
  }

  output += `Use \`read\` action with file path to see complete content of any file.`;

  return {
    content: [{
      type: 'text',
      text: output
    }]
  };
}

async function handleReadDoc(docsDir: string, filePath: string, logger: Logger): Promise<{ content: Array<{ type: string; text: string }> }> {
  const fullPath = path.join(docsDir, filePath);
  
  // Security check - ensure path is within docs directory
  const resolvedPath = path.resolve(fullPath);
  const resolvedDocsDir = path.resolve(docsDir);
  
  if (!resolvedPath.startsWith(resolvedDocsDir)) {
    return {
      content: [{
        type: 'text',
        text: 'Invalid file path - must be within documentation directory'
      }]
    };
  }

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const relativePath = path.relative(docsDir, fullPath);
    
    return {
      content: [{
        type: 'text',
        text: `**${relativePath}**\n\n${content}`
      }]
    };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return {
        content: [{
          type: 'text',
          text: `File not found: ${filePath}\n\nUse \`list_structure\` action to see available files`
        }]
      };
    }
    
    throw error;
  }
}

// Helper functions
async function searchInDirectory(dir: string, query: string, baseDir: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subResults = await searchInDirectory(fullPath, query, baseDir);
        results.push(...subResults);
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
        const fileResults = await searchInFile(fullPath, query, baseDir);
        if (fileResults.matches.length > 0) {
          results.push(fileResults);
        }
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }
  
  return results;
}

async function searchInFile(filePath: string, query: string, baseDir: string): Promise<SearchResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches: SearchMatch[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes(query)) {
      // Get context around the match
      const contextStart = Math.max(0, i - 1);
      const contextEnd = Math.min(lines.length - 1, i + 1);
      const context = lines.slice(contextStart, contextEnd + 1).join(' ').trim();
      
      matches.push({
        lineNumber: i + 1,
        lineContent: line.trim(),
        context: context.length > 200 ? context.substring(0, 200) + '...' : context
      });
    }
  }
  
  return {
    filePath,
    relativePath: path.relative(baseDir, filePath),
    matches
  };
}

async function countTotalFiles(structure: any): Promise<number> {
  let count = 0;
  
  // Count files in current level
  count += (structure.files || []).length;
  
  // Recursively count files in subdirectories
  for (const dirContent of Object.values(structure.directories || {})) {
    count += await countTotalFiles(dirContent);
  }
  
  return count;
}

// Types
interface SearchResult {
  filePath: string;
  relativePath: string;
  matches: SearchMatch[];
}

interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  context: string;
} 