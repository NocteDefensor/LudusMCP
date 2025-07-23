/**
 * Keyring utility for secure credential storage
 * Uses OS-level keyring services for maximum security
 */

import keytar from 'keytar';

const SERVICE_NAME = 'ludus-mcp';

/**
 * Credential keys used by the MCP server
 */
export const CREDENTIAL_KEYS = {
  ADMIN_USER: 'admin-user',
  CONNECTION_METHOD: 'connection-method',
  WIREGUARD_CONFIG_PATH: 'wireguard-config-path',
  API_KEY: 'api-key',
  SSH_HOST: 'ssh-host',
  SSH_USER: 'ssh-user',
  SSH_AUTH_METHOD: 'ssh-auth-method',
  SSH_PASSWORD: 'ssh-password',
  SSH_KEY_PATH: 'ssh-key-path',
  SSH_KEY_PASSPHRASE: 'ssh-key-passphrase',
} as const;

/**
 * Store a credential in the OS keyring
 */
export async function storeCredential(key: string, value: string): Promise<void> {
  try {
    await keytar.setPassword(SERVICE_NAME, key, value);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to store credential '${key}': ${errorMessage}`);
  }
}

/**
 * Retrieve a credential from the OS keyring
 */
export async function getCredential(key: string): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, key);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to retrieve credential '${key}': ${errorMessage}`);
  }
}

/**
 * Delete a credential from the OS keyring
 */
export async function deleteCredential(key: string): Promise<boolean> {
  try {
    return await keytar.deletePassword(SERVICE_NAME, key);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to delete credential '${key}': ${errorMessage}`);
  }
}

/**
 * Check if a credential exists in the keyring
 */
export async function hasCredential(key: string): Promise<boolean> {
  const value = await getCredential(key);
  return value !== null;
}

/**
 * Store multiple credentials at once
 */
export async function storeCredentials(credentials: Record<string, string>): Promise<void> {
  const promises = Object.entries(credentials).map(([key, value]) => 
    storeCredential(key, value)
  );
  await Promise.all(promises);
}

/**
 * Retrieve multiple credentials at once
 */
export async function getCredentials(keys: string[]): Promise<Record<string, string | null>> {
  const promises = keys.map(async (key) => ({
    key,
    value: await getCredential(key)
  }));
  
  const results = await Promise.all(promises);
  return results.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, string | null>);
}

/**
 * Clear all MCP server credentials from the keyring
 */
export async function clearAllCredentials(): Promise<void> {
  const keys = Object.values(CREDENTIAL_KEYS);
  const promises = keys.map(key => deleteCredential(key));
  await Promise.all(promises);
}

/**
 * Check if keyring is available on this system
 */
export function isKeyringSupportAvailable(): boolean {
  try {
    // Since keytar is already imported at the top of the file, just check if it works
    const platform = process.platform;
    const display = process.env.DISPLAY;
    const waylandDisplay = process.env.WAYLAND_DISPLAY;
    
    return platform !== 'linux' || display !== undefined || waylandDisplay !== undefined;
  } catch (error) {
    return false;
  }
}

/**
 * Get a summary of stored credentials (for debugging)
 */
export async function getCredentialSummary(): Promise<Record<string, boolean>> {
  const keys = Object.values(CREDENTIAL_KEYS);
  const promises = keys.map(async (key) => ({
    key,
    exists: await hasCredential(key)
  }));
  
  const results = await Promise.all(promises);
  return results.reduce((acc, { key, exists }) => {
    acc[key] = exists;
    return acc;
  }, {} as Record<string, boolean>);
} 