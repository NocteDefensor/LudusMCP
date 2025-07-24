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
    logger.info('Updating schemas from GitHub (preserving custom schemas)...');

    // Ensure .ludus-mcp directory exists
    await fs.mkdir(ludusConfigDir, { recursive: true });

    // Check if schemas directory already exists
    const schemasExists = await directoryExists(schemasDir);
    
    if (schemasExists) {
      logger.info('Existing schemas directory found - merging with official schemas');
      await mergeSchemas(schemasDir, tempDir, repoUrl, targetPath, logger);
    } else {
      logger.info('No existing schemas directory - creating fresh installation');
      await freshInstallSchemas(schemasDir, tempDir, repoUrl, targetPath, logger);
    }

    // Always update range-config.json (official file)
    await downloadRangeConfigSchema(schemasDir, logger);

    // Report final state
    const schemaFiles = await findSchemaFiles(schemasDir);
    logger.info(`Schema synchronization complete`, {
      totalFiles: schemaFiles.length,
      files: schemaFiles.map(f => path.basename(f))
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to update schemas (continuing without update)', { error: errorMessage });
    await removeDirectorySafe(tempDir);
  }
}

/**
 * Check if directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Merge official schemas with existing custom schemas
 */
async function mergeSchemas(
  schemasDir: string, 
  tempDir: string, 
  repoUrl: string, 
  targetPath: string, 
  logger: Logger
): Promise<void> {
  // Clean temp directory
  await removeDirectorySafe(tempDir);
  
  // Download official schemas to temp location
  logger.info('Downloading official schemas to temporary location...');
  await cloneSchemas(tempDir, tempDir + '-git', repoUrl, targetPath, logger);
  
  // Get list of official schema files
  const officialSchemas = await findYamlSchemaFiles(tempDir);
  const officialFileNames = officialSchemas.map(f => path.basename(f));
  
  logger.info(`Found ${officialFileNames.length} official schemas to update: ${officialFileNames.join(', ')}`);
  
  // Copy official schemas to target (overwriting official files only)
  for (const officialFile of officialSchemas) {
    const fileName = path.basename(officialFile);
    const targetFile = path.join(schemasDir, fileName);
    
    try {
      await fs.copyFile(officialFile, targetFile);
      logger.debug(`Updated official schema: ${fileName}`);
    } catch (error) {
      logger.warn(`Failed to update schema ${fileName}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  
  // Identify custom schemas (existing files not in official list)
  const existingSchemas = await findYamlSchemaFiles(schemasDir);
  const customSchemas = existingSchemas.filter(f => 
    !officialFileNames.includes(path.basename(f))
  );
  
  if (customSchemas.length > 0) {
    const customFileNames = customSchemas.map(f => path.basename(f));
    logger.info(`Preserved ${customSchemas.length} custom schemas: ${customFileNames.join(', ')}`);
  }
  
  // Clean up temp directory
  await removeDirectorySafe(tempDir);
}

/**
 * Fresh installation of schemas (no existing directory)
 */
async function freshInstallSchemas(
  schemasDir: string, 
  tempDir: string, 
  repoUrl: string, 
  targetPath: string, 
  logger: Logger
): Promise<void> {
  // Clean temp directory
  await removeDirectorySafe(tempDir);
  
  // Direct clone to final location (original behavior for fresh installs)
  await cloneSchemas(schemasDir, tempDir, repoUrl, targetPath, logger);
}

/**
 * Find YAML schema files (.yaml and .yml) in a directory (non-recursive)
 */
async function findYamlSchemaFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isFile() && (item.name.endsWith('.yaml') || item.name.endsWith('.yml'))) {
        files.push(path.join(dir, item.name));
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files.sort();
}

async function cloneSchemas(
  schemasDir: string, 
  tempDir: string, 
  repoUrl: string, 
  targetPath: string, 
  logger: Logger
): Promise<void> {
  // Clone only the specific schemas folder from yaml-schemas branch
  logger.info('Cloning schemas from GitHub repository (yaml-schemas branch)...');
  execSync(`git clone --filter=blob:none --sparse --depth 1 --branch yaml-schemas "${repoUrl}" "${tempDir}"`, { stdio: 'pipe' });
  execSync(`git -C "${tempDir}" sparse-checkout set "${targetPath}"`, { stdio: 'pipe' });

  const sourceSchemas = path.join(tempDir, targetPath);
  
  // Copy schemas to destination
  await copyDirectoryRecursive(sourceSchemas, schemasDir);
  
  // Clean up temp directory
  await removeDirectorySafe(tempDir);
}

async function downloadRangeConfigSchema(schemasDir: string, logger: Logger): Promise<void> {
  try {
    logger.info('Downloading range-config.json schema...');
    
    // Download range-config schema
    const response = await fetch('https://docs.ludus.cloud/schemas/range-config.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch range-config schema: ${response.status} ${response.statusText}`);
    }
    
    const schemaContent = await response.text();
    const schemaPath = path.join(schemasDir, 'range-config.json');
    
    await fs.writeFile(schemaPath, schemaContent, 'utf-8');
    logger.info('Successfully downloaded range-config.json schema');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to download range-config schema', { error: errorMessage });
  }
}

/**
 * Find all schema files (.json, .yaml, .yml) in a directory
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
      } else if (item.isFile() && (item.name.endsWith('.json') || item.name.endsWith('.yaml') || item.name.endsWith('.yml'))) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files.sort();
}

/**
 * Recursively copy directory contents
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