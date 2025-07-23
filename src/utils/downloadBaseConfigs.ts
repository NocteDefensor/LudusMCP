import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { Logger } from './logger.js';

export async function downloadBaseConfigs(logger: Logger): Promise<void> {
  const repoUrl = 'https://github.com/NocteDefensor/LudusMCP.git';
  const targetPath = 'base-configs';
  const ludusConfigDir = path.join(os.homedir(), '.ludus-mcp');
  const rangeConfigTemplatesDir = path.join(ludusConfigDir, 'range-config-templates');
  const baseConfigsDir = path.join(rangeConfigTemplatesDir, 'base-configs');
  const tempDir = path.join(ludusConfigDir, 'temp-base-configs-download');

  try {
    logger.info('Downloading base configurations from GitHub...');

    // Ensure .ludus-mcp and range-config-templates directories exist
    await fs.mkdir(rangeConfigTemplatesDir, { recursive: true });

    // Check if base-configs directory exists
    const dirExists = await fs.access(baseConfigsDir).then(() => true).catch(() => false);

    if (dirExists) {
      logger.info('base-configs directory exists, updating contents...');
      await updateBaseConfigsContents(baseConfigsDir, tempDir, repoUrl, targetPath, logger);
    } else {
      logger.info('base-configs directory not found, performing full clone...');
      await cloneBaseConfigs(baseConfigsDir, tempDir, repoUrl, targetPath, logger);
    }

    // Get file count and structure verification
    const configFiles = await findConfigFiles(baseConfigsDir);
    
    logger.info(`Successfully synchronized base configurations to ~/.ludus-mcp/range-config-templates/base-configs/`, {
      configFiles: configFiles.length,
      files: configFiles.map(f => path.basename(f))
    });

    if (configFiles.length > 0) {
      logger.info(`Configuration templates available: ${configFiles.map(f => path.basename(f)).join(', ')}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Failed to download base configurations (continuing without update)', { error: errorMessage });
    
    // Clean up on error
    await removeDirectorySafe(tempDir);
    // Don't throw - fail gracefully as requested
  }
}

/**
 * UPDATE MODE: Directory exists, update contents while preserving custom files
 */
async function updateBaseConfigsContents(
  baseConfigsDir: string, 
  tempDir: string, 
  repoUrl: string, 
  targetPath: string, 
  logger: Logger
): Promise<void> {
  // Clean up any existing temp directory
  await removeDirectorySafe(tempDir);

  // Clone to temp location
  logger.info('Cloning base-configs from GitHub repository...');
  execSync(`git clone --filter=blob:none --sparse --depth 1 "${repoUrl}" "${tempDir}"`, { stdio: 'pipe' });
  execSync(`git -C "${tempDir}" sparse-checkout set "${targetPath}"`, { stdio: 'pipe' });

  // Get source configs
  const sourceConfigsPath = path.join(tempDir, targetPath);
  const sourceFiles = await findConfigFiles(sourceConfigsPath);
  
  // Copy/overwrite GitHub config files, preserve user files
  let updatedCount = 0;
  let preservedCount = 0;
  
  // Get existing files for comparison
  const existingFiles = await findConfigFiles(baseConfigsDir);
  const existingFileNames = new Set(existingFiles.map(f => path.basename(f)));
  
  // Copy source files to destination (overwrite GitHub templates)
  for (const sourceFile of sourceFiles) {
    const fileName = path.basename(sourceFile);
    const destFile = path.join(baseConfigsDir, fileName);
    
    await fs.copyFile(sourceFile, destFile);
    updatedCount++;
    logger.debug('Updated config file', { fileName });
  }
  
  // Count preserved user files (files that exist but aren't from GitHub)
  const sourceFileNames = new Set(sourceFiles.map(f => path.basename(f)));
  for (const existingFileName of existingFileNames) {
    if (!sourceFileNames.has(existingFileName)) {
      preservedCount++;
      logger.debug('Preserved user config file', { fileName: existingFileName });
    }
  }

  // Clean up temp directory
  await removeDirectorySafe(tempDir);

  logger.info('Base configs update completed', {
    updated: updatedCount,
    preserved: preservedCount,
    total: updatedCount + preservedCount
  });
}

/**
 * CLONE MODE: Directory doesn't exist, full clone
 */
async function cloneBaseConfigs(
  baseConfigsDir: string, 
  tempDir: string, 
  repoUrl: string, 
  targetPath: string, 
  logger: Logger
): Promise<void> {
  // Clean up any existing temp directory
  await removeDirectorySafe(tempDir);

  // Clone only the specific base-configs folder
  logger.info('Cloning base-configs from GitHub repository...');
  execSync(`git clone --filter=blob:none --sparse --depth 1 "${repoUrl}" "${tempDir}"`, { stdio: 'pipe' });
  execSync(`git -C "${tempDir}" sparse-checkout set "${targetPath}"`, { stdio: 'pipe' });

  // Move base-configs to final location (Windows-safe approach)
  const sourceConfigsPath = path.join(tempDir, targetPath);
  await copyDirectoryRecursive(sourceConfigsPath, baseConfigsDir);

  // Clean up temp directory
  await removeDirectorySafe(tempDir);

  const configFiles = await findConfigFiles(baseConfigsDir);
  logger.info('Base configs clone completed', {
    cloned: configFiles.length,
    files: configFiles.map(f => path.basename(f))
  });
}

/**
 * Find all configuration files (.yml, .yaml) in a directory
 */
async function findConfigFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        const subFiles = await findConfigFiles(fullPath);
        files.push(...subFiles);
      } else if (item.isFile() && (item.name.endsWith('.yml') || item.name.endsWith('.yaml'))) {
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