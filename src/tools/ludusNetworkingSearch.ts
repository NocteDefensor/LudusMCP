import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludusMCP/cliWrapper.js';

const LudusNetworkingSchema = z.object({
  help: z.boolean().optional().default(false).describe('Show help information')
});

export function createLudusNetworkingDocsReadTool(logger: Logger, ludusCliWrapper: LudusCliWrapper) {
  return {
    name: 'ludus_networking_docs_read',
    description: `**NETWORKING DOCUMENTATION** - Direct Access to Complete Ludus Networking Documentation

**DIRECT ACCESS TO:**
- Network topology configurations
- VLAN and subnet configurations
- Network interface setup
- Firewall and routing rules
- Inter-VM communication patterns
- Network isolation strategies
- DNS and DHCP configurations

**SIMPLIFIED FUNCTIONALITY:**
- Always returns the complete networking documentation
- No search filtering - reads entire document
- Immediate access to all networking information

**PERFECT FOR:**
- Range planning (ludus_range_planner step 3)
- Network architecture design
- Understanding connectivity requirements
- Troubleshooting network issues

**TARGET**: Focuses specifically on networking-related documentation files.`,
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

export async function handleLudusNetworkingDocsRead(args: any): Promise<any> {
  try {
    const { help = false } = args;

    if (help) {
      return {
        content: [{
          type: 'text',
          text: 'ludus_networking_docs_read - Read complete Ludus networking documentation\n\nThis tool reads the entire networking documentation and returns all networking configuration information.\nNo parameters required - always returns complete documentation.'
        }]
      };
    }

    // Always read the complete networking documentation
    const homeDir = os.homedir();
    const docsDir = path.join(homeDir, '.ludus-mcp', 'docs');
    
    try {
      const networkingContent = await readNetworkingDocs(docsDir);
      
      return {
        content: [{
          type: 'text', 
          text: `# Complete Ludus Networking Documentation\n\n${networkingContent}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error reading networking documentation: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe documentation may not be downloaded yet. Try running the server startup process to download docs.`
        }]
      };
    }

  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error in ludus_networking_docs_read: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

async function readNetworkingDocs(docsDir: string): Promise<string> {
  const networkingFiles = [
    'networking.md',
    'configuration/networking.md',
    'quick-start/networking.md'
  ];

  let allContent = '';
  
  for (const file of networkingFiles) {
    const filePath = path.join(docsDir, file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      allContent += `\n## From ${file}\n\n${content}\n`;
    } catch (error) {
      // File doesn't exist, continue
    }
  }

  if (!allContent) {
    throw new Error('No networking documentation files found');
  }

  return allContent;
}