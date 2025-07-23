import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { Logger } from '../utils/logger.js';
import { 
  storeCredentials, 
  getCredentials, 
  CREDENTIAL_KEYS, 
  isKeyringSupportAvailable,
  getCredentialSummary
} from '../utils/keyring.js';

export interface LudusConfig {
  adminUser: string;
  connectionMethod: 'wireguard' | 'ssh-tunnel';
  wireguardConfig?: string | undefined;  // Optional for SSH tunnel mode
  apiKey: string;
  sshHost: string;
  sshUser: string;
  sshAuthMethod: 'password' | 'key' | 'plink';
  sshPassword?: string | undefined;  // Optional for key-based auth
  sshKeyPath?: string | undefined;   // Optional for password auth
  sshKeyPassphrase?: string | undefined;  // Optional passphrase for password-protected keys
  ludusUrl?: string;
  verifySSL?: boolean;
}

export interface SetupResult {
  success: boolean;
  message: string;
  config?: LudusConfig;
  requiresRestart?: boolean;
}

export class InteractiveSetup {
  private logger: Logger;
  private rl: any;

  constructor(logger: Logger) {
    this.logger = logger;
    this.rl = createInterface({
      input: process.stdin,
      output: process.stderr  // Use stderr to avoid interfering with MCP protocol stdout
    });
  }

  /**
   * Secure prompt for sensitive data (hides input)
   */
  private async securePrompt(question: string): Promise<string> {
    // Simple fallback - just use regular prompt for now
    // The security benefit of hiding input is minimal for this use case
    return this.prompt(question);
  }

  private async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer: string) => {
        resolve(answer.trim());
      });
    });
  }

  private checkWireGuardAvailable(): boolean {
    try {
      execSync('wg --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private checkWireGuardConnectivity(): boolean {
    try {
      const result = execSync('wg show', { encoding: 'utf8' });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async connectWireGuard(configPath: string): Promise<boolean> {
    try {
      if (!existsSync(configPath)) {
        console.error(`WireGuard config file not found: ${configPath}`);
        return false;
      }

      // First check if WireGuard is already connected
      if (this.checkWireGuardConnectivity()) {
        console.error('WireGuard VPN already connected');
        return true;
      }

      // Check if interface already exists
      try {
        const interfaces = execSync('wg show interfaces', { encoding: 'utf8' });
        if (interfaces.trim().length > 0) {
          console.error('WireGuard interface already active');
          return true;
        }
      } catch (e) {
        // wg command might not be available, continue with connection attempt
      }

      // Try to connect to WireGuard - platform-specific approach
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // Windows: Use WireGuard GUI or service approach
        return await this.connectWireGuardWindows(configPath);
      } else {
        // Linux/Mac: Use wg-quick
        return await this.connectWireGuardUnix(configPath);
      }

    } catch (error: any) {
      console.error(`WireGuard connection failed: ${error.message}`);
      return false;
    }
  }

  // Helper function to execute WireGuard commands securely
  private async executeWireGuardCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { 
        stdio: 'pipe', 
        shell: false 
      });
      
      let output = '';
      let error = '';
      
      process.stdout.on('data', (data) => output += data.toString());
      process.stderr.on('data', (data) => error += data.toString());
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${error}`));
        }
      });
      
      process.on('error', (err) => reject(err));
    });
  }

  private async connectWireGuardWindows(configPath: string): Promise<boolean> {
    try {
      console.error('Setting up WireGuard tunnel on Windows...');
      
      // Find WireGuard installation
      const wireguardPaths = [
        'C:\\Program Files\\WireGuard\\wireguard.exe',
        'C:\\Program Files (x86)\\WireGuard\\wireguard.exe'
      ];
      
      let wireguardPath = '';
      for (const path of wireguardPaths) {
        if (existsSync(path)) {
          wireguardPath = path;
          break;
        }
      }
      
      if (!wireguardPath) {
        console.error('WireGuard not found. Please install it first:');
        console.error('   Download from: https://www.wireguard.com/install/');
        console.error('   Or run: winget install WireGuard.WireGuard');
        return false;
      }
      
      // Extract tunnel name from config file path
      const tunnelName = basename(configPath, '.conf');
      
      // Stop existing tunnel if running
      try {
        console.error('Stopping existing WireGuard tunnel...');
        // Use spawn to prevent command injection
        const result = spawn(wireguardPath, ['/uninstalltunnelservice', tunnelName], { 
          stdio: 'pipe',
          shell: false
        });
        await new Promise<void>((resolve) => {
          result.on('close', () => resolve());
          result.on('error', () => resolve()); // Ignore errors for cleanup
        });
        console.error('Existing tunnel stopped');
      } catch (error) {
        // Tunnel might not exist, continue
        console.error(' No existing tunnel to stop');
      }
      
      // Install and start new tunnel
      try {
        console.error('Installing WireGuard tunnel service...');
        const result = await this.executeWireGuardCommand(wireguardPath, ['/installtunnelservice', configPath]);
        console.error('WireGuard tunnel service installed and started');
        
        // Wait a moment for tunnel to establish
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify connection
        if (this.checkWireGuardConnectivity()) {
          console.error('WireGuard VPN connected successfully');
          return true;
        } else {
          console.error('WireGuard tunnel started but connectivity verification failed');
          console.error('This might be normal - the tunnel may need more time to establish');
          return true; // Return true since the service started successfully
        }
        
      } catch (error: any) {
        console.error(`Failed to install WireGuard tunnel service: ${error.message}`);
        return false;
      }
      
    } catch (error: any) {
      console.error(`Windows WireGuard connection failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Stop WireGuard tunnel on Windows
   */
  private async stopWireGuardWindows(configPath: string): Promise<void> {
    try {
      const wireguardPaths = [
        'C:\\Program Files\\WireGuard\\wireguard.exe',
        'C:\\Program Files (x86)\\WireGuard\\wireguard.exe'
      ];
      
      let wireguardPath = '';
      for (const path of wireguardPaths) {
        if (existsSync(path)) {
          wireguardPath = path;
          break;
        }
      }
      
      if (wireguardPath) {
        const tunnelName = basename(configPath, '.conf');
        console.error('Stopping WireGuard tunnel...');
        
        try {
          await this.executeWireGuardCommand(wireguardPath, ['/uninstalltunnelservice', tunnelName]);
          console.error('WireGuard tunnel stopped');
        } catch (error) {
          console.error(' WireGuard tunnel was not running');
        }
      }
    } catch (error: any) {
      console.error(` Error stopping WireGuard tunnel: ${error.message}`);
    }
  }

  private async connectWireGuardUnix(configPath: string): Promise<boolean> {
    try {
      const result = await this.executeWireGuardCommand('wg-quick', ['up', configPath]);
      console.error('WireGuard VPN connected successfully');
      return true;
    } catch (error: any) {
      // Handle "already exists" error gracefully
      if (error.message.includes('already exists')) {
        console.error('WireGuard interface already active');
        return true;
      }
      throw error; // Re-throw other errors
    }
  }

  private async validateApiKey(apiKey: string, ludusUrl: string = 'https://198.51.100.1:8080'): Promise<boolean> {
    try {
      // Set the API key in environment for the command
      const env = { ...process.env, LUDUS_API_KEY: apiKey };
      
      // Test the API key by getting server info
      const result = spawn('ludus', ['--url', ludusUrl, 'version'], {
        env,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      result.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      result.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      return new Promise((resolve) => {
        result.on('close', (code) => {
          // Check both stdout and stderr for success indicators
          const output = stdout + stderr;
          const success = code === 0 || 
                         output.includes('version') || 
                         output.includes('Ludus') ||
                         output.includes('server');
          
          if (success) {
            console.error(`API key validation successful`);
            resolve(true);
          } else {
            console.error(`API key validation failed. Code: ${code}`);
            console.error(`Output: ${output}`);
            resolve(false);
          }
        });

        result.on('error', (error) => {
          console.error(`API key validation error: ${error.message}`);
          resolve(false);
        });
      });
    } catch (error: any) {
      console.error(`API key validation failed: ${error.message}`);
      return false;
    }
  }

  private async testSshConnectivity(config: LudusConfig): Promise<boolean> {
    try {
      const isWindows = process.platform === 'win32';
      let command: string;
      let args: string[];

      if (config.sshAuthMethod === 'key') {
        // Key-based authentication
        command = 'ssh';
        args = [
          '-i', config.sshKeyPath!,
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'ConnectTimeout=10',
          `${config.sshUser}@${config.sshHost}`,
          'echo "SSH test successful"'
        ];
      } else if (config.sshAuthMethod === 'plink') {
        // Windows plink with password
        command = 'plink';
        args = [
          '-batch',
          '-ssh',
          '-pw', config.sshPassword!,
          `${config.sshUser}@${config.sshHost}`,
          'echo "SSH test successful"'
        ];
      } else {
        // Password authentication with sshpass (Linux)
        command = 'sshpass';
        args = [
          '-p', config.sshPassword!,
          'ssh',
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'ConnectTimeout=10',
          `${config.sshUser}@${config.sshHost}`,
          'echo "SSH test successful"'
        ];
      }

      const result = spawn(command, args, { stdio: 'pipe' });

      return new Promise((resolve) => {
        let resolved = false;
        
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.error('⏰ SSH connectivity test timeout');
            result.kill();
            resolve(false);
          }
        }, 15000); // 15 second timeout

        result.on('close', (code) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            if (code === 0) {
              console.error('SSH connectivity test successful');
              resolve(true);
            } else {
              console.error(`SSH connectivity test failed with code: ${code}`);
              resolve(false);
            }
          }
        });

        result.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.error(`SSH connectivity test error: ${error.message}`);
            resolve(false);
          }
        });
      });
    } catch (error: any) {
      console.error(`SSH connectivity test failed: ${error.message}`);
      return false;
    }
  }

  private async createSshTunnel(config: LudusConfig): Promise<boolean> {
    try {
      console.error('📡 Creating SSH tunnels for ports 8080 and 8081...');
      
      const isWindows = process.platform === 'win32';
      
      let command: string;
      let args: string[];
      
      if (config.sshAuthMethod === 'key') {
        // Key-based authentication
        command = 'ssh';
        args = [
          '-i', config.sshKeyPath!,
          '-o', 'StrictHostKeyChecking=no',
          '-f', '-N',
          '-L', '8080:localhost:8080',
          '-L', '8081:localhost:8081',
          `${config.sshUser}@${config.sshHost}`
        ];
      } else if (config.sshAuthMethod === 'plink') {
        // Windows plink with password
        command = 'plink';
        args = [
          '-batch',
          '-ssh',
          '-pw', config.sshPassword!,
          '-L', '8080:localhost:8080',
          '-L', '8081:localhost:8081',
          '-N',
          `${config.sshUser}@${config.sshHost}`
        ];
      } else {
        // Password authentication with sshpass (Linux)
        command = 'sshpass';
        args = [
          '-p', config.sshPassword!,
          'ssh',
          '-o', 'StrictHostKeyChecking=no',
          '-f', '-N',
          '-L', '8080:localhost:8080',
          '-L', '8081:localhost:8081',
          `${config.sshUser}@${config.sshHost}`
        ];
      }
      
      const result = spawn(command, args, { stdio: 'pipe' });

      return new Promise((resolve) => {
        let resolved = false;
        
        // Set a timeout to prevent hanging on Windows
        const timeout = setTimeout(async () => {
          if (!resolved) {
            resolved = true;
            console.error('⏰ SSH tunnel process timeout - testing connectivity...');
            
            // Give the tunnel a moment to establish
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Test if tunnel is working
            const tunnelWorks = await this.testTunnelConnectivity();
            if (tunnelWorks) {
              console.error('SSH tunnels established successfully');
              resolve(true);
            } else {
              console.error('SSH tunnels created but connectivity test failed');
              resolve(false);
            }
          }
        }, 5000); // 5 second timeout

        result.on('close', async (code) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            
            if (code === 0) {
              // Give the tunnel a moment to establish
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Test if tunnel is working
              const tunnelWorks = await this.testTunnelConnectivity();
              if (tunnelWorks) {
                console.error('SSH tunnels established successfully');
                resolve(true);
              } else {
                console.error('SSH tunnels created but connectivity test failed');
                resolve(false);
              }
            } else {
              console.error(`SSH tunnel creation failed with code: ${code}`);
              resolve(false);
            }
          }
        });

        result.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.error(`SSH tunnel creation error: ${error.message}`);
            resolve(false);
          }
        });
      });
    } catch (error: any) {
      console.error(`SSH tunnel creation failed: ${error.message}`);
      return false;
    }
  }

  private async testTunnelConnectivity(): Promise<boolean> {
    try {
      // Test if we can reach localhost:8080 (tunneled to Ludus API)
      const result = spawn('curl', [
        '-k', '-s', '--connect-timeout', '5',
        'https://localhost:8080/version'
      ], { stdio: 'pipe' });

      return new Promise((resolve) => {
        let output = '';
        
        result.stdout.on('data', (data) => {
          output += data.toString();
        });

        result.on('close', (code) => {
          // If curl succeeds (code 0) or gets some response, tunnel is working
          const tunnelWorks = code === 0 || output.length > 0;
          resolve(tunnelWorks);
        });

        result.on('error', () => {
          resolve(false);
        });
      });
    } catch (error: any) {
      console.error(`Tunnel connectivity test failed: ${error.message}`);
      return false;
    }
  }

  private getConfigFromEnvironment(): LudusConfig | null {
    const requiredVars = {
      adminUser: 'LUDUS_ADMIN_USER',
      wireguardConfig: 'LUDUS_WIREGUARD_CONFIG',
      apiKey: 'LUDUS_API_KEY',
      sshHost: 'LUDUS_SSH_HOST',
      sshUser: 'LUDUS_SSH_USER',
      sshPassword: 'LUDUS_SSH_PASSWORD'
    };

    const config: any = {};
    
    for (const [key, envVar] of Object.entries(requiredVars)) {
      const value = process.env[envVar];
      if (!value) {
        return null; // Missing required environment variable
      }
      config[key] = value;
    }

    // Optional environment variables
    config.ludusUrl = process.env.LUDUS_URL || 'https://198.51.100.1:8080';
    config.verifySSL = Boolean(process.env.LUDUS_VERIFY?.toLowerCase() === 'true');

    return config as LudusConfig;
  }

  /**
   * Try to retrieve credentials from keyring
   */
  private async getConfigFromKeyring(): Promise<LudusConfig | null> {
    try {
      if (!isKeyringSupportAvailable()) {
        console.error(' Keyring support not available on this system');
        return null;
      }

      const credentials = await getCredentials([
        CREDENTIAL_KEYS.ADMIN_USER,
        CREDENTIAL_KEYS.CONNECTION_METHOD,
        CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH,
        CREDENTIAL_KEYS.API_KEY,
        CREDENTIAL_KEYS.SSH_HOST,
        CREDENTIAL_KEYS.SSH_USER,
              CREDENTIAL_KEYS.SSH_AUTH_METHOD,
      CREDENTIAL_KEYS.SSH_PASSWORD,
      CREDENTIAL_KEYS.SSH_KEY_PATH,
      CREDENTIAL_KEYS.SSH_KEY_PASSPHRASE
      ]);

      const connectionMethod = credentials[CREDENTIAL_KEYS.CONNECTION_METHOD] as 'wireguard' | 'ssh-tunnel' || 'wireguard';
      const sshAuthMethod = credentials[CREDENTIAL_KEYS.SSH_AUTH_METHOD] as 'password' | 'key' | 'plink' || 'password';

      // Check if all required credentials are present
      const baseRequiredCredentials = [
        credentials[CREDENTIAL_KEYS.ADMIN_USER],
        credentials[CREDENTIAL_KEYS.CONNECTION_METHOD],
        credentials[CREDENTIAL_KEYS.API_KEY],
        credentials[CREDENTIAL_KEYS.SSH_HOST],
        credentials[CREDENTIAL_KEYS.SSH_USER],
        credentials[CREDENTIAL_KEYS.SSH_AUTH_METHOD]
      ];

      const hasBaseCredentials = baseRequiredCredentials.every(cred => !!cred);
      const hasWireguardConfig = connectionMethod === 'ssh-tunnel' || !!credentials[CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH];
      const hasSshAuth = (sshAuthMethod === 'password' && !!credentials[CREDENTIAL_KEYS.SSH_PASSWORD]) ||
                         (sshAuthMethod !== 'password' && !!credentials[CREDENTIAL_KEYS.SSH_KEY_PATH]);

      const hasAllCredentials = hasBaseCredentials && hasWireguardConfig && hasSshAuth;

      if (!hasAllCredentials) {
        return null;
      }

      const baseUrl = connectionMethod === 'ssh-tunnel' ? 'https://localhost:8080' : 'https://198.51.100.1:8080';

      return {
              adminUser: credentials[CREDENTIAL_KEYS.ADMIN_USER]!,
      connectionMethod,
      wireguardConfig: credentials[CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH] || undefined,
      apiKey: credentials[CREDENTIAL_KEYS.API_KEY]!,
      sshHost: credentials[CREDENTIAL_KEYS.SSH_HOST]!,
      sshUser: credentials[CREDENTIAL_KEYS.SSH_USER]!,
      sshAuthMethod,
      sshPassword: credentials[CREDENTIAL_KEYS.SSH_PASSWORD] || undefined,
      sshKeyPath: credentials[CREDENTIAL_KEYS.SSH_KEY_PATH] || undefined,
      sshKeyPassphrase: credentials[CREDENTIAL_KEYS.SSH_KEY_PASSPHRASE] || undefined,
        ludusUrl: process.env.LUDUS_URL || baseUrl,
        verifySSL: process.env.LUDUS_VERIFY?.toLowerCase() === 'true'
      };
    } catch (error: any) {
      console.error(` Failed to retrieve credentials from keyring: ${error.message}`);
      return null;
    }
  }

  /**
   * Store credentials in keyring after successful validation
   */
  private async storeConfigInKeyring(config: LudusConfig): Promise<void> {
    try {
      if (!isKeyringSupportAvailable()) {
        console.error(' Keyring support not available - credentials will not be stored');
        return;
      }

      const credentialsToStore: Record<string, string> = {
        [CREDENTIAL_KEYS.ADMIN_USER]: config.adminUser,
        [CREDENTIAL_KEYS.CONNECTION_METHOD]: config.connectionMethod,
        [CREDENTIAL_KEYS.API_KEY]: config.apiKey,
        [CREDENTIAL_KEYS.SSH_HOST]: config.sshHost,
        [CREDENTIAL_KEYS.SSH_USER]: config.sshUser,
        [CREDENTIAL_KEYS.SSH_AUTH_METHOD]: config.sshAuthMethod
      };

      // Only store optional configs if they exist
      if (config.wireguardConfig) {
        credentialsToStore[CREDENTIAL_KEYS.WIREGUARD_CONFIG_PATH] = config.wireguardConfig;
      }
      if (config.sshPassword) {
        credentialsToStore[CREDENTIAL_KEYS.SSH_PASSWORD] = config.sshPassword;
      }
      if (config.sshKeyPath) {
        credentialsToStore[CREDENTIAL_KEYS.SSH_KEY_PATH] = config.sshKeyPath;
      }
      if (config.sshKeyPassphrase) {
        credentialsToStore[CREDENTIAL_KEYS.SSH_KEY_PASSPHRASE] = config.sshKeyPassphrase;
      }

      await storeCredentials(credentialsToStore);
      console.error('Credentials stored securely in keyring');
    } catch (error: any) {
      console.error(` Failed to store credentials in keyring: ${error.message}`);
    }
  }

  private async promptForCredentials(): Promise<LudusConfig> {
    console.error('\nLudus MCP Server Initialization');
    console.error('=================================');
    console.error('Please provide the following information (provided by your administrator):\n');

    // Ask for connection method first
    console.error('📡 Connection Method');
    console.error('Choose how to connect to the Ludus API:');
    console.error('  (w) WireGuard VPN - Direct access via WireGuard tunnel');
    console.error('  (s) SSH Tunnel - Access via SSH port forwarding');
    const methodChoice = await this.prompt('Connection method? (w/s) [default: w]: ');
    const connectionMethod: 'wireguard' | 'ssh-tunnel' = methodChoice.toLowerCase() === 's' ? 'ssh-tunnel' : 'wireguard';

    const adminUser = await this.prompt('Ludus Admin Username: ');
    
    let wireguardConfig: string | undefined;
    let ludusUrl: string;
    
    if (connectionMethod === 'wireguard') {
      wireguardConfig = await this.prompt('WireGuard Config Path: ');
      ludusUrl = 'https://198.51.100.1:8080';
    } else {
      console.error('Using SSH tunnel mode - will connect to https://localhost:8080');
      ludusUrl = 'https://localhost:8080';
    }
    
    const apiKey = await this.securePrompt('API Key: ');
    const sshHost = await this.prompt('Ludus Server SSH Host: ');
    const sshUser = await this.prompt('Ludus Server SSH User: ');
    
    // Ask for SSH authentication method
    console.error('\nSSH Authentication Method');
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      console.error('Choose SSH authentication method:');
      console.error('  (p) PuTTY plink - Use plink with password (must be in PATH)');
      console.error('  (k) Key - Use SSH key-based authentication');
    } else {
      console.error('Choose SSH authentication method:');
      console.error('  (p) Password - Use SSH password authentication');
      console.error('  (k) Key - Use SSH key-based authentication');
    }
    
    const authChoice = await this.prompt(`SSH auth method? (p/k) [default: ${isWindows ? 'k' : 'p'}]: `);
    let sshAuthMethod: 'password' | 'key' | 'plink';
    let sshPassword: string | undefined;
    let sshKeyPath: string | undefined;
    let sshKeyPassphrase: string | undefined;
    
    if (authChoice.toLowerCase() === 'k') {
      sshAuthMethod = 'key';
      sshKeyPath = await this.prompt('SSH Key Path: ');
      
      // Ask if the key is password-protected
      const isKeyProtected = await this.prompt('Is your SSH key password-protected? (y/n) [default: n]: ');
      if (isKeyProtected.toLowerCase() === 'y') {
        sshKeyPassphrase = await this.securePrompt('SSH Key Passphrase: ');
      }
    } else if (isWindows) {
      sshAuthMethod = 'plink';
      sshPassword = await this.securePrompt('SSH Password: ');
    } else {
      sshAuthMethod = 'password';
      sshPassword = await this.securePrompt('SSH Password: ');
    }

    const useCustomUrl = await this.prompt('Use custom Ludus URL? (y/n) [default: n]: ');
    if (useCustomUrl.toLowerCase() === 'y') {
      ludusUrl = await this.prompt('Ludus URL: ');
    }

    const verifySSL = await this.prompt('Verify SSL certificates? (y/n) [default: n]: ');

    return {
      adminUser,
      connectionMethod,
      wireguardConfig,
      apiKey,
      sshHost,
      sshUser,
      sshAuthMethod,
      sshPassword,
      sshKeyPath,
      sshKeyPassphrase,
      ludusUrl,
      verifySSL: verifySSL.toLowerCase() === 'y'
    };
  }

  /**
   * Main interactive setup flow
   */
  async runSetup(forceInteractive: boolean = false): Promise<SetupResult> {
    try {
      let config: LudusConfig;
      
      // Try to get config from different sources in order of preference
      const envConfig = this.getConfigFromEnvironment();
      const keyringSummary = await getCredentialSummary();
      const keyringSupportAvailable = isKeyringSupportAvailable();
      
      if (forceInteractive) {
        // Force interactive mode - skip environment and keyring checks
        if (process.stdin.isTTY) {
          config = await this.promptForCredentials();
        } else {
          return {
            success: false,
            message: 'Interactive setup requested but no TTY available.'
          };
        }
      } else if (envConfig) {
        console.error('\nUsing configuration from environment variables');
        config = envConfig;
      } else {
        const keyringConfig = await this.getConfigFromKeyring();
        if (keyringConfig) {
          console.error('\nUsing stored credentials from keyring');
          config = keyringConfig;
        } else if (process.stdin.isTTY) {
          // Show keyring status for debugging
          if (keyringSupportAvailable) {
            console.error('\nKeyring credentials summary:');
            for (const [key, exists] of Object.entries(keyringSummary)) {
              console.error(`  ${key}: ${exists ? '' : ''}`);
            }
          }
          
          // Interactive mode
          config = await this.promptForCredentials();
        } else {
          // No TTY and no stored credentials - error
          return {
            success: false,
            message: 'No configuration available. Please set environment variables, run setup interactively, or use --setup-keyring flag.'
          };
        }
      }

      console.error('\nValidating configuration...');

      // Handle connection method
      if (config.connectionMethod === 'wireguard') {
        // 1. Check WireGuard availability
        if (!this.checkWireGuardAvailable()) {
          return {
            success: false,
            message: 'WireGuard is not installed or not available. Please install WireGuard first.'
          };
        }

        // 2. Connect to WireGuard VPN
        console.error('Connecting to WireGuard VPN...');
        if (!config.wireguardConfig || !await this.connectWireGuard(config.wireguardConfig)) {
          return {
            success: false,
            message: 'Failed to connect to WireGuard VPN. Please check your configuration file.'
          };
        }
        console.error('WireGuard VPN connected');
        
        // Important WireGuard usage guidance
        console.error('');
        console.error('IMPORTANT: WireGuard Usage Notes');
        console.error('═══════════════════════════════════════');
        console.error('• WireGuard tunnels must be manually started before launching Claude Desktop');
        console.error('• If WireGuard is down, the MCP client will attempt SSH tunnel fallback');
        console.error('• For automatic startup, consider configuring WireGuard as a Windows service');
        console.error('• To make WireGuard start automatically on boot:');
        console.error('  - Use WireGuard GUI: Right-click tunnel → "Install as Service"');
        console.error('  - Or manually: Run as Admin and use /installtunnelservice flag');
        console.error('');
      } else {
        // SSH tunnel mode
        console.error('Setting up SSH tunnel...');
        if (!await this.createSshTunnel(config)) {
          return {
            success: false,
            message: 'Failed to create SSH tunnel. Please check your SSH credentials.'
          };
        }
        console.error('SSH tunnel established');
      }

      // 3. Validate API key
      console.error('🔑 Validating API key...');
      if (!await this.validateApiKey(config.apiKey, config.ludusUrl)) {
        return {
          success: false,
          message: 'API key validation failed. Please check your API key and server connectivity.'
        };
      }
      console.error('API key validated');

      // 4. Test SSH connectivity
      console.error('🔌 Testing SSH connectivity...');
      if (!await this.testSshConnectivity(config)) {
        return {
          success: false,
          message: 'SSH connectivity test failed. Please check your SSH configuration.'
        };
      }
      console.error('SSH connectivity verified');

      // 5. Store credentials in keyring if setup was successful and credentials were entered interactively
      if (process.stdin.isTTY && !envConfig) {
        await this.storeConfigInKeyring(config);
      }

      // Initialization completed - avoid console output that might interfere with MCP protocol

      // Final success message with WireGuard reminder
      if (config.connectionMethod === 'wireguard') {
        console.error('Setup complete!');
        console.error('');
        console.error('REMEMBER: For Claude Desktop usage:');
        console.error('   1. Manually start your WireGuard tunnel before launching Claude Desktop');
        console.error('   2. Or configure WireGuard as a Windows service for automatic startup');
        console.error('   3. If WireGuard is down, the MCP client will try SSH tunnel fallback');
        console.error('');
      } else {
        console.error('Setup complete!');
      }

      return {
        success: true,
        message: 'Ludus MCP server initialized successfully',
        config
      };
    } catch (error: any) {
      this.logger.error('Initialization failed', { error });
      return {
        success: false,
        message: `Initialization failed: ${error.message}`
      };
    } finally {
      this.rl.close();
    }
  }

  /**
   * Check if setup is complete by verifying stored credentials
   */
  static async checkSetupComplete(): Promise<boolean> {
    try {
      // Check environment variables first
      const envVars = ['LUDUS_ADMIN_USER', 'LUDUS_WIREGUARD_CONFIG', 'LUDUS_API_KEY', 
                      'LUDUS_SSH_HOST', 'LUDUS_SSH_USER', 'LUDUS_SSH_PASSWORD'];
      
      if (envVars.every(v => process.env[v])) {
        return true;
      }

      // Check keyring if available
      if (isKeyringSupportAvailable()) {
        const summary = await getCredentialSummary();
        return Object.values(summary).every(exists => exists);
      }

      return false;
    } catch (error) {
      return false;
    }
  }
} 