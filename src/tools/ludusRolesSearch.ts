import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

const LudusRolesSchema = z.object({
  help: z.boolean().optional().default(false).describe('Show help information')
});

export function createLudusRolesDocsReadTool(logger: Logger, ludusCliWrapper: LudusCliWrapper) {
  return {
    name: 'ludus_roles_docs_read',
    description: `**ROLES DOCUMENTATION** - Direct Access to Complete Ludus Roles Documentation

**DIRECT ACCESS TO:**
- Complete roles listing and descriptions
- Role variables and configuration options
- Role dependencies and requirements
- GitHub repositories and sources
- Installation and usage examples

**SIMPLIFIED FUNCTIONALITY:**
- Always returns the complete roles documentation (docs/roles.md)
- No search filtering - reads entire document
- Immediate access to all role information

**PERFECT FOR:**
- Range planning (ludus_range_planner step 3)
- Role research and selection
- Finding role variables and GitHub links
- Understanding role capabilities

**TARGET**: Focuses specifically on \`docs/roles.md\` and related role documentation.`,
    inputSchema: {
      type: 'object',
      properties: {
        help: {
          type: 'boolean',
          default: false,
          description: 'Show help information'
        }
      },
      required: []
    },
  };
}

export async function handleLudusRolesDocsRead(args: any): Promise<any> {
  try {
    const { help = false } = args;

    if (help) {
      return {
        content: [{
          type: 'text',
          text: 'ludus_roles_docs_read - Read complete Ludus roles documentation\n\nThis tool reads the entire docs/roles.md file and returns all role information.\nNo parameters required - always returns complete documentation.'
        }]
      };
    }

    // Always read the complete roles documentation
    const homeDir = os.homedir();
    const docsDir = path.join(homeDir, '.ludus-mcp', 'docs');
    const rolesFilePath = path.join(docsDir, 'roles.md');

    try {
      const rolesContent = await fs.readFile(rolesFilePath, 'utf-8');
      
      return {
        content: [{
          type: 'text', 
          text: `# Complete Ludus Roles Documentation\n\n${rolesContent}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error reading roles documentation: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe documentation may not be downloaded yet. Try running the server startup process to download docs.`
        }]
      };
    }

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error in ludus_roles_docs_read: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
} 