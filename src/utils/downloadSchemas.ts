import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Logger } from './logger.js';

export async function downloadSchemas(logger: Logger): Promise<void> {
  const repoUrl = 'https://github.com/NocteDefensor/LudusMCP.git';
  const targetPath = 'schemas';
  const ludusConfigDir = path.join(os.homedir(), '.ludus-mcp');
  const schemasDir = path.join(ludusConfigDir, 'schemas');
  const tempDir = path.join(ludusConfigDir, 'temp-schemas-download');

  try {
    logger.info('Downloading fresh schemas from GitHub...');

    // Ensure .ludus-mcp directory exists
    await fs.mkdir(ludusConfigDir, { recursive: true });

    // Clean slate - remove existing schemas directory and temp
    await removeDirectorySafe(schemasDir);
    await removeDirectorySafe(tempDir);

    // Clone fresh GitHub schemas folder
    logger.info('Cloning schemas from GitHub repository...');
    await cloneSchemas(schemasDir, tempDir, repoUrl, targetPath, logger);

    // Download range-config.json into the schemas folder
    await downloadRangeConfigSchema(schemasDir, logger);

    // Get file count and structure verification
    const schemaFiles = await findSchemaFiles(schemasDir);
    
    logger.info(`Successfully synchronized schemas to ~/.ludus-mcp/schemas/`, {
      schemaFiles: schemaFiles.length,
      files: schemaFiles.map(f => path.basename(f))
    });

    if (schemaFiles.length > 0) {
      logger.info(`Schema files available: ${schemaFiles.map(f => path.basename(f)).join(', ')}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to download schemas (continuing without update)', { error: errorMessage });
    
    // Clean up on error
    await removeDirectorySafe(tempDir);
    // Don't throw - fail gracefully as requested
  }
}

/**
 * Clone schemas from GitHub repository
 */
async function cloneSchemas(
  schemasDir: string, 
  tempDir: string, 
  repoUrl: string, 
  targetPath: string, 
  logger: Logger
): Promise<void> {
  // Clone only the specific schemas folder
  logger.info('Cloning schemas from GitHub repository...');
  execSync(`git clone --filter=blob:none --sparse --depth 1 "${repoUrl}" "${tempDir}"`, { stdio: 'pipe' });
  execSync(`git -C "${tempDir}" sparse-checkout set "${targetPath}"`, { stdio: 'pipe' });

  // Move schemas to final location (Windows-safe approach)
  const sourceSchemasPath = path.join(tempDir, targetPath);
  await copyDirectoryRecursive(sourceSchemasPath, schemasDir);

  // Clean up temp directory
  await removeDirectorySafe(tempDir);

  const schemaFiles = await findSchemaFiles(schemasDir);
  logger.info('GitHub schemas clone completed', {
    cloned: schemaFiles.length,
    files: schemaFiles.map(f => path.basename(f))
  });
}

/**
 * Download range-config.json schema from docs.ludus.cloud
 */
async function downloadRangeConfigSchema(schemasDir: string, logger: Logger): Promise<void> {
  const rangeConfigSchemaFilePath = path.join(schemasDir, 'range-config.json');

  try {
    logger.info('Downloading range-config.json schema from docs.ludus.cloud...');
    
    const response = await fetch('https://docs.ludus.cloud/schemas/range-config.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const rangeConfigSchema = await response.text();
    
    // Write the range-config schema to disk
    await fs.writeFile(rangeConfigSchemaFilePath, rangeConfigSchema, 'utf-8');
    
    logger.info('Successfully downloaded range-config.json schema');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to fetch range-config schema (continuing without it)', { error: errorMessage });
    // Don't throw here - GitHub schemas should still work
  }
}

/**
 * Find all schema files (.json) in a directory
 */
async function findSchemaFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subFiles = await findSchemaFiles(fullPath);
        files.push(...subFiles);
      } else if (item.isFile() && item.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files.sort();
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