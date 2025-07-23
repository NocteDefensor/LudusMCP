import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Logger } from './logger.js';

export async function downloadLudusDocumentation(logger: Logger): Promise<void> {
  const repoUrl = 'https://gitlab.com/badsectorlabs/ludus.git';
  const targetPath = 'docs/docs';
  const ludusConfigDir = path.join(os.homedir(), '.ludus-mcp');
  const docsDir = path.join(ludusConfigDir, 'docs');
  const tempDir = path.join(ludusConfigDir, 'temp-docs-download');

  try {
    logger.info('Downloading fresh Ludus documentation...');

    // Ensure .ludus-mcp directory exists
    await fs.mkdir(ludusConfigDir, { recursive: true });

    // Clean up any existing temp and docs directories (Windows-safe)
    await removeDirectorySafe(tempDir);
    await removeDirectorySafe(docsDir);

    // Clone only the specific docs folder
    logger.info('Cloning documentation from GitLab repository...');
    execSync(`git clone --filter=blob:none --sparse --depth 1 "${repoUrl}" "${tempDir}"`, { stdio: 'pipe' });
    execSync(`git -C "${tempDir}" sparse-checkout set "${targetPath}"`, { stdio: 'pipe' });

    // Move docs to final location (Windows-safe approach)
    const sourceDocsPath = path.join(tempDir, targetPath);
    await copyDirectoryRecursive(sourceDocsPath, docsDir);

    // Verify we got the important subdirectories
    const importantDirs = ['environment-guides', 'quick-start', 'troubleshooting'];
    const foundDirs: string[] = [];
    const missingDirs: string[] = [];

    for (const dirName of importantDirs) {
      const dirPath = path.join(docsDir, dirName);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          const files = await findMarkdownFiles(dirPath);
          foundDirs.push(`${dirName} (${files.length} files)`);
        } else {
          missingDirs.push(dirName);
        }
      } catch {
        missingDirs.push(dirName);
      }
    }

    // Clean up temp directory
    await removeDirectorySafe(tempDir);

    // Get total file count and structure
    const allFiles = await findAllFiles(docsDir);
    const markdownFiles = await findMarkdownFiles(docsDir);
    
    logger.info(`Successfully downloaded Ludus documentation to ~/.ludus-mcp/docs/`, {
      totalFiles: allFiles.length,
      markdownFiles: markdownFiles.length,
      foundDirectories: foundDirs,
      missingDirectories: missingDirs.length > 0 ? missingDirs : undefined
    });

    if (foundDirs.length > 0) {
      logger.info(`📂 Key documentation sections available: ${foundDirs.join(', ')}`);
    }

    if (missingDirs.length > 0) {
      logger.warn(` Some expected directories were not found: ${missingDirs.join(', ')}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to download Ludus documentation', { error: errorMessage });
    
    // Clean up on error
    await removeDirectorySafe(tempDir);
    throw new Error(`Documentation download failed: ${errorMessage}`);
  }
}

async function findAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subFiles = await findAllFiles(fullPath);
        files.push(...subFiles);
      } else if (item.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files.sort();
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subFiles = await findMarkdownFiles(fullPath);
        files.push(...subFiles);
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files.sort();
}

/**
 * Get directory structure for documentation
 */
export async function getDocsStructure(logger: Logger): Promise<any> {
  const ludusConfigDir = path.join(os.homedir(), '.ludus-mcp');
  const docsDir = path.join(ludusConfigDir, 'docs');

  try {
    return await buildDirectoryTree(docsDir, docsDir);
  } catch (error) {
    logger.error('Failed to get docs structure', { error });
    return null;
  }
}

async function buildDirectoryTree(dirPath: string, basePath: string): Promise<any> {
  const items = await fs.readdir(dirPath, { withFileTypes: true });
  const tree: any = {
    directories: {},
    files: []
  };

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    const relativePath = path.relative(basePath, fullPath);

    if (item.isDirectory()) {
      tree.directories[item.name] = await buildDirectoryTree(fullPath, basePath);
    } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
      tree.files.push({
        name: item.name,
        path: relativePath,
        fullPath: fullPath
      });
    }
  }

  return tree;
}

/**
 * Windows-safe recursive directory copy
 */
async function copyDirectoryRecursive(source: string, destination: string): Promise<void> {
  // Ensure destination directory exists
  await fs.mkdir(destination, { recursive: true });

  const items = await fs.readdir(source, { withFileTypes: true });

  for (const item of items) {
    const sourcePath = path.join(source, item.name);
    const destPath = path.join(destination, item.name);

    if (item.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destPath);
    } else if (item.isFile()) {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

/**
 * Windows-safe directory removal
 */
async function removeDirectorySafe(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
    // Directory exists, try to remove it
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist or couldn't be removed - that's fine for cleanup
  }
} 