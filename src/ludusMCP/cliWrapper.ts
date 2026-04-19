import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import { LudusConfig } from './interactiveSetup.js';
import { LudusSSHTunnelManager, type SSHTunnelConfig } from './sshTunnelManager.js';

export interface CommandResult {
  success: boolean;
  data?: any;
  message: string;
  rawOutput?: string;
}

export class LudusCliWrapper {
  private logger: Logger;
  private config: LudusConfig;
  private sshTunnelPid: number | null = null;
  private sshTunnelPort: number = 8081;
  private regularTunnelPid: number | null = null; // For port 8080
  private tunnelManager?: LudusSSHTunnelManager;
  private baseCwd: string;

  constructor(logger: Logger, config: LudusConfig) {
    this.logger = logger;
    this.config = config;
    this.baseCwd = path.join(os.homedir(), '.ludus-mcp');

    // Ensure base directory exists
    this.ensureBaseDirectory();

    // Log environment details for debugging
    this.logger.info('LudusCliWrapper initialized', {
      platform: process.platform,
      nodeVersion: process.version,
      workingDirectory: process.cwd(),
      baseCwd: this.baseCwd,
      connectionMethod: this.config.connectionMethod,
      sshAuthMethod: this.config.sshAuthMethod,
      pathEnv: process.env.PATH?.substring(0, 500) + '...', // First 500 chars of PATH
      userProfile: process.env.USERPROFILE || process.env.HOME,
      sshAgent: process.env.SSH_AUTH_SOCK || 'not set'
    });

    // Skip tunnel initialization for direct mode (running on Ludus server)
    if (this.config.connectionMethod === 'direct') {
      this.logger.info('Direct mode enabled - skipping SSH tunnel initialization');
      return;
    }

    // Always initialize tunnel manager for admin operations (port 8081)
    // Admin commands always use SSH tunnel regardless of connection method
    this.initializeTunnelManager().catch((error: any) => {
        // Extremely aggressive error handling for debugging
        let errorInfo: any = {
          timestamp: new Date().toISOString(),
          phase: 'constructor_catch_block'
        };

        try {
          errorInfo.errorMessage = error?.message || 'no_message_property';
        } catch (e) {
          errorInfo.errorMessage = 'message_access_failed';
        }

        try {
          errorInfo.errorString = String(error);
        } catch (e) {
          errorInfo.errorString = 'string_conversion_failed';
        }

        try {
          errorInfo.errorType = error?.constructor?.name || 'unknown_type';
        } catch (e) {
          errorInfo.errorType = 'type_access_failed';
        }

        try {
          errorInfo.errorKeys = Object.keys(error || {});
        } catch (e) {
          errorInfo.errorKeys = 'keys_access_failed';
        }

        try {
          errorInfo.errorToString = error?.toString?.() || 'no_toString';
        } catch (e) {
          errorInfo.errorToString = 'toString_failed';
        }

        this.logger.error('SSH TUNNEL CONSTRUCTOR FAILURE', errorInfo);
      });
  }

  /**
   * Initialize the SSH tunnel manager using ssh2 library
   */
  private async initializeTunnelManager(): Promise<void> {
    if (!this.config.sshHost || !this.config.sshUser) {
      throw new Error('SSH configuration is incomplete - missing host or user');
    }

    if (this.config.sshAuthMethod === 'key' && !this.config.sshKeyPath) {
      throw new Error('SSH key path is required for key authentication');
    }

    if (this.config.sshAuthMethod === 'password' && !this.config.sshPassword) {
      throw new Error('SSH password is required for password authentication');
    }

    const tunnelConfig: SSHTunnelConfig = {
      host: this.config.sshHost!,
      port: 22, // Default SSH port
      username: this.config.sshUser!,
      authMethod: this.config.sshAuthMethod!,
      regularPort: 8080,
      primaryPort: 8081,
      privateKeyPath: this.config.sshAuthMethod === 'key' ? this.config.sshKeyPath! : undefined,
      privateKeyPassphrase: this.config.sshAuthMethod === 'key' ? this.config.sshKeyPassphrase : undefined,
      password: this.config.sshAuthMethod === 'password' ? this.config.sshPassword! : undefined
    };

    this.tunnelManager = new LudusSSHTunnelManager(tunnelConfig, this.logger);
    
    try {
      await this.tunnelManager.connect();
      this.logger.info('SSH tunnel manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize SSH tunnel manager', { error });
      throw error;
    }
  }

  /**
   * Ensure SSH tunnels are healthy before executing commands
   */
  private async ensureTunnelsHealthy(): Promise<void> {
    // Initialize tunnel manager if not already done
    if (!this.tunnelManager) {
      await this.initializeTunnelManager();
    }
    
    if (this.tunnelManager) {
      try {
        await this.tunnelManager.ensureTunnelsHealthy();
      } catch (error) {
        this.logger.error('Failed to ensure tunnel health', { error });
        throw new Error(`SSH tunnel health check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      throw new Error('Unable to initialize SSH tunnel manager for fallback');
    }
  }

  /**
   * Check if a command requires admin API (SSH tunnel)
   */
  private isAdminCommand(command: string): boolean {
    // Based on Ludus CLI documentation analysis (see ludus-command-api-endpoints.txt)
    // ONLY these commands require SSH tunnel to port 8081:
    // From docs/cli.md: "To use the `add` or `rm` commands, the admin API endpoint must be used."
    
    const adminCommands = [
      'users add',   // Create new users - requires admin endpoint
      'users rm'     // Remove users - requires admin endpoint
    ];

    // ALL other commands use regular endpoint (port 8080) including:
    // - users apikey, users list, users wireguard, users creds
    // - ALL range operations (even with --user flag)
    // - ALL template operations  
    // - ALL other operations
    return adminCommands.some(adminCmd => command.includes(adminCmd));
  }

  /**
   * Set up environment variables for regular API calls via WireGuard
   */
  private setupWireGuardEnvironment(): void {
    process.env.LUDUS_API_KEY = this.config.apiKey;
    process.env.LUDUS_URL = this.config.ludusUrl || 'https://198.51.100.1:8080';
    process.env.LUDUS_VERIFY = this.config.verifySSL ? 'true' : 'false';
    process.env.LUDUS_JSON = 'true'; // Always use JSON for MCP processing
  }

  /**
   * Set up environment variables for regular API calls via SSH tunnel (port 8080)
   */
  private setupSSHTunnelRegularEnvironment(): void {
    process.env.LUDUS_API_KEY = this.config.apiKey;
    process.env.LUDUS_URL = 'https://127.0.0.1:8080';
    process.env.LUDUS_VERIFY = 'false'; // Local tunnel doesn't need SSL verification
    process.env.LUDUS_JSON = 'true';
  }

  /**
   * Set up environment variables for admin API calls via SSH tunnel (port 8081)
   */
  private setupSSHTunnelAdminEnvironment(): void {
    process.env.LUDUS_API_KEY = this.config.apiKey;
    process.env.LUDUS_URL = `https://127.0.0.1:${this.sshTunnelPort}`;
    process.env.LUDUS_VERIFY = 'false'; // Local tunnel doesn't need SSL verification
    process.env.LUDUS_JSON = 'true';
  }

  /**
   * Set up environment variables for direct localhost connections (running on Ludus server)
   */
  private setupDirectEnvironment(): void {
    process.env.LUDUS_API_KEY = this.config.apiKey;
    process.env.LUDUS_URL = this.config.ludusUrl || 'https://127.0.0.1:8080';
    process.env.LUDUS_VERIFY = 'false'; // Localhost doesn't need SSL verification
    process.env.LUDUS_JSON = 'true';
  }

  /**
   * Set up environment variables for direct localhost admin API (port 8081)
   */
  private setupDirectAdminEnvironment(): void {
    process.env.LUDUS_API_KEY = this.config.apiKey;
    process.env.LUDUS_URL = 'https://127.0.0.1:8081';
    process.env.LUDUS_VERIFY = 'false'; // Localhost doesn't need SSL verification
    process.env.LUDUS_JSON = 'true';
  }

  /**
   * Create SSH tunnel for admin operations using tunnel manager
   */
  private async createSSHTunnel(): Promise<boolean> {
    try {
      this.logger.info('Creating SSH tunnel for admin operations using tunnel manager');
      
      // Initialize tunnel manager if not already done
      if (!this.tunnelManager) {
        await this.initializeTunnelManager();
      }

      // Ensure tunnels are healthy
      if (this.tunnelManager) {
        await this.tunnelManager.ensureTunnelsHealthy();
        this.logger.info('SSH tunnel for admin operations established successfully');
        return true;
      } else {
        this.logger.error('Failed to initialize tunnel manager');
        return false;
      }
    } catch (error: any) {
      this.logger.error('Failed to create SSH tunnel for admin operations', { error });
      return false;
    }
  }

  /**
   * Create SSH tunnel for regular operations using tunnel manager
   */
  private async createRegularOperationsTunnel(): Promise<boolean> {
    try {
      this.logger.info('Creating SSH tunnel for regular operations using tunnel manager');
      
      // Initialize tunnel manager if not already done
      if (!this.tunnelManager) {
        await this.initializeTunnelManager();
      }

      // Ensure tunnels are healthy
      if (this.tunnelManager) {
        await this.tunnelManager.ensureTunnelsHealthy();
        this.logger.info('SSH tunnel for regular operations established successfully');
        return true;
      } else {
        this.logger.error('Failed to initialize tunnel manager');
        return false;
      }
    } catch (error: any) {
      this.logger.error('Failed to create SSH tunnel for regular operations', { error });
      return false;
    }
  }

  /**
   * Execute command with smart routing
   */
  async executeCommand(command: string, args: string[] = [], workingDirectory?: string): Promise<CommandResult> {
    const originalCwd = process.cwd();
    let usingSSHFallback = false;
    
    // Build command string for admin check and logging (not execution)
    const fullCommand = `${command} ${args.join(' ')}`.trim();
    const isAdmin = this.isAdminCommand(fullCommand);

    try {
      // Use specified working directory or default to ~/.ludus-mcp/
      const targetCwd = workingDirectory || this.baseCwd;
      process.chdir(targetCwd);

      let actualRoute: string;
      if (this.config.connectionMethod === 'direct') {
        actualRoute = isAdmin ? 'Direct localhost (admin)' : 'Direct localhost';
      } else {
        actualRoute = isAdmin ? 'SSH tunnel' :
          (this.config.connectionMethod === 'ssh-tunnel' ? 'SSH tunnel' : 'WireGuard VPN');
      }

      this.logger.info('Executing Ludus command', {
        command: fullCommand,
        isAdmin,
        route: actualRoute,
        workingDirectory: targetCwd
      });

      // Handle direct mode - no tunnels needed
      if (this.config.connectionMethod === 'direct') {
        // Direct mode - connect directly to localhost
        if (isAdmin) {
          this.setupDirectAdminEnvironment();
        } else {
          this.setupDirectEnvironment();
        }
      } else {
        // Ensure connections are healthy before executing commands
        if (isAdmin) {
          // Admin commands always use SSH tunnel
          await this.ensureTunnelsHealthy();
        } else {
          // Regular commands use connection method specified in config
          if (this.config.connectionMethod === 'ssh-tunnel') {
            await this.ensureTunnelsHealthy();
          } else {
            // Check WireGuard health - if unhealthy, try SSH fallback
            const wgHealth = await this.checkWireGuardHealth();
            if (!wgHealth.healthy) {
              this.logger.warn('WireGuard not healthy, attempting SSH fallback', {
                reason: wgHealth.message
              });

              try {
                await this.ensureTunnelsHealthy();
                usingSSHFallback = true;
                this.logger.info('SSH fallback successful - using SSH tunnel for this command');
              } catch (sshError) {
                throw new Error(`WireGuard unavailable: ${wgHealth.message}. SSH fallback also failed: ${sshError instanceof Error ? sshError.message : String(sshError)}`);
              }
            }
          }
        }

        // Set up appropriate environment and connectivity
        if (isAdmin) {
          // Admin command - use SSH tunnel (port 8081)
          this.setupSSHTunnelAdminEnvironment();
        } else {
          // Regular command - use appropriate connection method
          if (this.config.connectionMethod === 'ssh-tunnel' || usingSSHFallback) {
            this.setupSSHTunnelRegularEnvironment();
          } else {
            this.setupWireGuardEnvironment();
          }
        }
      }

      // Execute the command securely using argument array
      const ludusArgs = [command, ...args];
      const ludusCommand = `ludus ${fullCommand}`; // For logging only
      let output: string = '';
      
      try {
        // Use spawn with argument array to prevent command injection
        const ludusProcess = spawn('ludus', ludusArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false // Prevent shell interpretation
        });

        let stdout = '';
        let stderr = '';

        ludusProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        ludusProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        await new Promise<void>((resolve, reject) => {
          ludusProcess.on('close', (code: number) => {
            // Ludus CLI outputs to stderr even on success
            output = stderr || stdout || '';
            if (output && stderr) {
              this.logger.debug('Using stderr output from Ludus CLI', { 
                stderr: stderr.substring(0, 200) + '...'
              });
            }
            resolve();
          });

          ludusProcess.on('error', (error: Error) => {
            reject(error);
          });

          // Set timeout
          setTimeout(() => {
            ludusProcess.kill();
            reject(new Error('Command timeout'));
          }, 30000);
        });
      } catch (error: any) {
        // Fallback to execSync approach - use spawn instead to maintain security
        try {
          // Note: execSync with string commands is still potentially vulnerable
          // This is kept as fallback only - primary spawn approach above is secure
          output = execSync(ludusCommand, {
            encoding: 'utf-8',
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          }) as string;
        } catch (execError: any) {
          if (execError.stderr && execError.stderr.toString().trim().length > 0) {
            output = execError.stderr.toString();
            this.logger.debug('Using stderr output from Ludus CLI (fallback)', { 
              stderr: execError.stderr.toString().substring(0, 200) + '...'
            });
          } else if (execError.stdout && execError.stdout.toString().trim().length > 0) {
            output = execError.stdout.toString();
          } else {
            throw error;
          }
        }
      }

      // Parse JSON output if possible
      let parsedData: any;
      
      if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
        try {
          parsedData = JSON.parse(output);
        } catch (parseError) {
          // If parsing fails, use raw output
          parsedData = output;
        }
      } else {
        // Not JSON, use raw output
        parsedData = output;
      }

      // Tunnel cleanup is handled automatically by tunnel manager
      // Clear environment variables
      delete process.env.LUDUS_API_KEY;
      delete process.env.LUDUS_URL;
      delete process.env.LUDUS_VERIFY;
      delete process.env.LUDUS_JSON;

      return {
        success: true,
        data: parsedData,
        message: output,
        rawOutput: output
      };
    } catch (error: any) {
      this.logger.error('Command execution failed', {
        command: fullCommand,
        error: error.message,
        workingDirectory,
        stdout: error.stdout?.toString(),
        stderr: error.stderr?.toString()
      });

      // Tunnel cleanup is handled automatically by tunnel manager
      // Clear environment variables
      delete process.env.LUDUS_API_KEY;
      delete process.env.LUDUS_URL;
      delete process.env.LUDUS_VERIFY;
      delete process.env.LUDUS_JSON;

      return {
        success: false,
        message: `Command failed: ${error.message}`,
        rawOutput: error.stdout?.toString() || error.stderr?.toString()
      };
    } finally {
      // Always restore original working directory
      process.chdir(originalCwd);
    }
  }

  /**
   * Execute arbitrary Ludus CLI command
   */
  async executeArbitraryCommand(command: string, args: string[] = []): Promise<CommandResult> {
    return this.executeCommand(command, args);
  }

  /**
   * List user ranges (current user or specific user for admin)
   */
  async listUserRanges(user?: string): Promise<CommandResult> {
    const args = ['list'];
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * Deploy range with full CLI options support
   */
  async deployRange(options: {
    user?: string;
    configPath?: string;
    force?: boolean;
    tags?: string;
    limit?: string;
    onlyRoles?: string;
    verboseAnsible?: boolean;
  } = {}): Promise<CommandResult> {
    try {
      const { user, configPath, force, tags, limit, onlyRoles, verboseAnsible } = options;

      // First set config if provided
      if (configPath) {
        const configArgs = ['config', 'set', '-f', configPath];
        if (user) {
          configArgs.push('--user', user);
        }
        if (force) {
          configArgs.push('--force');
        }
        
        const configResult = await this.executeCommand('range', configArgs);
        if (!configResult.success) {
          return configResult;
        }
      }

      // Then deploy with all options
      const deployArgs = ['deploy'];
      
      if (user) {
        deployArgs.push('--user', user);
      }
      if (force) {
        deployArgs.push('--force');
      }
      if (tags) {
        deployArgs.push('--tags', tags);
      }
      if (limit) {
        deployArgs.push('--limit', limit);
      }
      if (onlyRoles) {
        deployArgs.push('--only-roles', onlyRoles);
      }
      if (verboseAnsible) {
        deployArgs.push('--verbose-ansible');
      }
      
      return this.executeCommand('range', deployArgs);
    } catch (error: any) {
      return {
        success: false,
        message: `Range deployment failed: ${error.message}`
      };
    }
  }

  /**
   * Get available deployment tags
   */
  async getTags(user?: string): Promise<CommandResult> {
    const args = ['gettags'];
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * Abort range deployment
   */
  async abortRange(user?: string): Promise<CommandResult> {
    const args = ['abort'];
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * Get range status (current user or specific user for admin)
   */
  async getRangeStatus(user?: string): Promise<CommandResult> {
    const args = ['list']; // 'list' is alias for 'status' in Ludus CLI
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * Destroy range - permanently remove all VMs and free resources
   */
  async destroyRange(user?: string, noPrompt: boolean = false): Promise<CommandResult> {
    const args = ['rm'];
    if (noPrompt) {
      args.push('--no-prompt');
    }
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * Get RDP connection files for Windows VMs
   */
  async getRangeRdpInfo(user?: string): Promise<CommandResult> {
    // Create user-specific directory for file downloads
    const userDir = this.ensureUserDirectory(user);
    const rdpPath = path.join(userDir, 'rdp.zip');
    
    const args = ['rdp', '--output', rdpPath];
    if (user) {
      args.push('--user', user);
    }
    
    this.logger.info('Downloading RDP configuration to specific path', { 
      path: rdpPath,
      user: user || 'current-user'
    });
    
    // Execute command with explicit output path
    const result = await this.executeCommand('range', args);
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
        message: `RDP configuration saved to ${rdpPath}`,
        rawOutput: result.rawOutput || ''
      };
    }
    
    return result;
  }

  /**
   * Get WireGuard configuration for user
   */
  async getUserWireguardConfig(user?: string): Promise<CommandResult> {
    const args = ['wireguard'];
    if (user) {
      args.push('--user', user);
    }
    
    // Create user-specific directory for file downloads
    const userDir = this.ensureUserDirectory(user);
    
    // Execute command to get WireGuard config
    const result = await this.executeCommand('user', args);
    
    if (result.success && result.data) {
      try {
        // Write WireGuard config to file
        const configPath = path.join(userDir, 'wireguard.conf');
        fs.writeFileSync(configPath, result.data, 'utf8');
        
        this.logger.info('WireGuard configuration written to file', { 
          path: configPath,
          user: user || 'current-user'
        });
        
        return {
          success: true,
          data: result.data,
          message: `WireGuard configuration saved to ${configPath}`,
          rawOutput: result.rawOutput || ''
        };
      } catch (error: any) {
        this.logger.error('Failed to write WireGuard config to file', { 
          error: error.message,
          userDir 
        });
        
        // Return original result if file writing fails
        return result;
      }
    }
    
    return result;
  }

  /**
   * Get /etc/hosts formatted file for range
   */
  async getRangeEtcHosts(user?: string): Promise<CommandResult> {
    const args = ['etc-hosts'];
    if (user) {
      args.push('--user', user);
    }
    
    // Create user-specific directory for file downloads
    const userDir = this.ensureUserDirectory(user);
    
    // Execute command to get hosts entries
    const result = await this.executeCommand('range', args);
    
    if (result.success && result.data) {
      try {
        // Write hosts entries to file
        const hostsPath = path.join(userDir, 'hosts');
        fs.writeFileSync(hostsPath, result.data, 'utf8');
        
        this.logger.info('Hosts entries written to file', { 
          path: hostsPath,
          user: user || 'current-user'
        });
        
        return {
          success: true,
          data: result.data,
          message: `Hosts entries saved to ${hostsPath}`,
          rawOutput: result.rawOutput || ''
        };
      } catch (error: any) {
        this.logger.error('Failed to write hosts entries to file', { 
          error: error.message,
          userDir 
        });
        
        // Return original result if file writing fails
        return result;
      }
    }
    
    return result;
  }

  /**
   * Power on VMs in range
   */
  async powerOnRange(user?: string, vmNames?: string): Promise<CommandResult> {
    const args = ['on']; // Ludus power commands don't support --force flag
    if (vmNames) {
      args.push('--name', vmNames);
    }
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('power', args);
  }

  /**
   * Power off VMs in range
   */
  async powerOffRange(user?: string, vmNames?: string): Promise<CommandResult> {
    const args = ['off']; // Ludus power commands don't support --force flag
    if (vmNames) {
      args.push('--name', vmNames);
    }
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('power', args);
  }

  /**
   * Get range configuration
   */
  async getRangeConfig(user?: string): Promise<CommandResult> {
    const args = ['config', 'get'];
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * Set range configuration from file
   */
  async setRangeConfig(configPath: string, user?: string, force: boolean = false): Promise<CommandResult> {
    const args = ['config', 'set', '-f', configPath];
    if (user) {
      args.push('--user', user);
    }
    if (force) {
      args.push('--force');
    }
    return this.executeCommand('range', args);
  }

  /**
   * Get range deployment logs
   */
  async getRangeLogs(user?: string, follow: boolean = false): Promise<CommandResult> {
    const args = ['logs'];
    if (follow) {
      args.push('-f');
    }
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('range', args);
  }

  /**
   * List available templates
   */
  async listTemplates(): Promise<CommandResult> {
    return this.executeCommand('templates', ['list']);
  }

  /**
   * Get user information for a specific user (or current user if none specified)
   */
  async getUserInfo(user?: string): Promise<CommandResult> {
    const args = ['list'];
    if (user) {
      args.push('--user', user);
    }
    return this.executeCommand('users', args);
  }

  /**
   * List all users in the system
   */
  async listAllUsers(): Promise<CommandResult> {
    return this.executeCommand('users', ['list', 'all']);
  }

  /**
   * Add a new user (admin operation)
   */
  async addUser(name: string, userId: string, isAdmin: boolean = false): Promise<CommandResult> {
    const args = ['add', '--name', name, '--userid', userId];
    if (isAdmin) {
      args.push('--admin');
    }
    return this.executeCommand('users', args);
  }

  /**
   * Remove a user (admin operation)
   */
  async removeUser(userId: string): Promise<CommandResult> {
    return this.executeCommand('users', ['rm', '--user', userId]);
  }

  /**
   * Get API key for user (admin operation)
   */
  async getUserApiKey(userId: string): Promise<CommandResult> {
    return this.executeCommand('users', ['apikey', '--user', userId]);
  }

  /**
   * Test connectivity for both regular and admin operations
   */
  async testConnectivity(): Promise<{ rangeOps: boolean; adminOps: boolean }> {
    const result = { rangeOps: false, adminOps: false };

    // Test regular API connectivity based on connection method
    if (this.config.connectionMethod === 'direct') {
      // Direct mode - test localhost connectivity
      try {
        this.logger.info('Testing direct localhost connectivity for regular operations');

        this.setupDirectEnvironment();

        let output: string = '';
        try {
          const ludusProcess = spawn('ludus', ['version'], {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          ludusProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          ludusProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          await new Promise<void>((resolve, reject) => {
            ludusProcess.on('close', (code: number) => {
              output = stderr || stdout || '';
              resolve();
            });

            ludusProcess.on('error', (error: Error) => {
              reject(error);
            });

            setTimeout(() => {
              ludusProcess.kill();
              reject(new Error('Command timeout'));
            }, 5000);
          });
        } catch (error: any) {
          try {
            output = execSync('ludus version', { encoding: 'utf-8', timeout: 5000 }) as string;
          } catch (execError: any) {
            if (execError.stderr) {
              output = execError.stderr.toString();
            } else if (execError.stdout) {
              output = execError.stdout.toString();
            } else {
              throw error;
            }
          }
        }

        result.rangeOps = output.includes('Ludus Server') || output.includes('Server version') || output.includes('server:');
        this.logger.info('Direct localhost connectivity test result (regular operations)', { success: result.rangeOps, output: output.trim() });

        // Also test admin operations for direct mode (port 8081)
        try {
          this.logger.info('Testing direct localhost connectivity for admin operations (port 8081)');
          this.setupDirectAdminEnvironment();

          let adminOutput: string = '';
          const adminProcess = spawn('ludus', ['version'], {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let adminStdout = '';
          let adminStderr = '';

          adminProcess.stdout.on('data', (data: Buffer) => {
            adminStdout += data.toString();
          });

          adminProcess.stderr.on('data', (data: Buffer) => {
            adminStderr += data.toString();
          });

          await new Promise<void>((resolve, reject) => {
            adminProcess.on('close', (code: number) => {
              adminOutput = adminStderr || adminStdout || '';
              resolve();
            });

            adminProcess.on('error', (error: Error) => {
              reject(error);
            });

            setTimeout(() => {
              adminProcess.kill();
              reject(new Error('Command timeout'));
            }, 5000);
          });

          result.adminOps = adminOutput.includes('Ludus Server') || adminOutput.includes('Server version') || adminOutput.includes('server:');
          this.logger.info('Direct localhost connectivity test result (admin operations)', { success: result.adminOps });
        } catch (adminError: any) {
          this.logger.error('Direct localhost admin connectivity test failed', { error: adminError.message || adminError });
        }

        // Clean up environment
        delete process.env.LUDUS_API_KEY;
        delete process.env.LUDUS_URL;
        delete process.env.LUDUS_VERIFY;
        delete process.env.LUDUS_JSON;

        return result;
      } catch (error: any) {
        this.logger.error('Direct localhost connectivity test failed (regular operations)', {
          error: error.message || error,
          stack: error.stack
        });
      }
    } else if (this.config.connectionMethod === 'wireguard') {
      // Test WireGuard connectivity for regular operations
      try {
        this.logger.info('Testing WireGuard connectivity for regular operations');

        // Use the new WireGuard health check (no auto-connect)
        const wgHealth = await this.checkWireGuardHealth();

        result.rangeOps = wgHealth.healthy;
        this.logger.info('WireGuard connectivity test result (regular operations)', {
          success: result.rangeOps,
          message: wgHealth.message
        });
      } catch (error: any) {
        this.logger.error('WireGuard connectivity test failed (regular operations)', {
          error: error.message || error,
          stack: error.stack
        });
      }
    } else {
      // Test SSH tunnel connectivity for regular operations (port 8080)
      try {
        this.logger.info('Testing SSH tunnel connectivity for regular operations (port 8080)');
        
        // Use tunnel manager to ensure tunnels are healthy
        if (this.tunnelManager) {
          await this.tunnelManager.ensureTunnelsHealthy();
        } else {
          throw new Error('No tunnel manager available for regular operations');
        }
        
        this.setupSSHTunnelRegularEnvironment();
        
        let output: string = '';
        try {
          // Use spawn to capture both stdout and stderr properly
          const ludusProcess = spawn('ludus', ['version'], {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stdout = '';
          let stderr = '';

          ludusProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          ludusProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          await new Promise<void>((resolve, reject) => {
            ludusProcess.on('close', (code: number) => {
              // Ludus CLI outputs to stderr even on success
              output = stderr || stdout || '';
              resolve();
            });

            ludusProcess.on('error', (error: Error) => {
              reject(error);
            });

            // Set timeout
            setTimeout(() => {
              ludusProcess.kill();
              reject(new Error('Command timeout'));
            }, 5000);
          });
        } catch (error: any) {
          // Fallback to execSync approach
          try {
            output = execSync('ludus version', { encoding: 'utf-8', timeout: 5000 }) as string;
          } catch (execError: any) {
            if (execError.stderr) {
              output = execError.stderr.toString();
            } else if (execError.stdout) {
              output = execError.stdout.toString();
            } else {
              throw error;
            }
          }
        }
        
        result.rangeOps = output.includes('Ludus Server') || output.includes('Server version') || output.includes('server:');
        this.logger.info('SSH tunnel connectivity test result (regular operations)', { success: result.rangeOps, output: output.trim() });
      } catch (error: any) {
        this.logger.error('SSH tunnel connectivity test failed (regular operations)', { 
          error: error.message || error,
          stack: error.stack 
        });
      }
    }

    // ALWAYS test SSH tunnel for admin operations (port 8081) regardless of connection method
    try {
      this.logger.info('Testing SSH tunnel connectivity for admin operations (port 8081)');
      if (this.tunnelManager) {
        // Use tunnel manager to check health
        const health = await this.tunnelManager.checkTunnelHealth();
        result.adminOps = health.primaryHealthy;
        this.logger.info('SSH tunnel connectivity test result (admin operations)', { success: result.adminOps });
      } else {
        this.logger.debug('No tunnel manager available for admin operations test');
      }
    } catch (error) {
      this.logger.debug('SSH tunnel connectivity test failed (admin operations will be limited)', { error });
    }

    // Clean up environment
    delete process.env.LUDUS_API_KEY;
    delete process.env.LUDUS_URL;
    delete process.env.LUDUS_VERIFY;
    delete process.env.LUDUS_JSON;

    return result;
  }

  /**
   * Check if WireGuard is currently connected
   */
  private checkWireGuardConnectivity(): boolean {
    try {
      const result = execSync('wg show', { encoding: 'utf8', stdio: 'pipe' });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if WireGuard is available on the system
   */
  private checkWireGuardAvailable(): boolean {
    try {
      execSync('wg --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check WireGuard health by pinging the WireGuard interface
   * Returns health status and suggestions for the user
   */
  private async checkWireGuardHealth(): Promise<{ healthy: boolean; message: string }> {
    try {
      this.logger.debug('Testing WireGuard connectivity via ping');
      
      // Ping the WireGuard interface (2 pings for reliability)
      const isWindows = process.platform === 'win32';
      const pingCommand = isWindows ? 'ping' : 'ping';
      const pingArgs = isWindows ? ['-n', '2', '198.51.100.1'] : ['-c', '2', '198.51.100.1'];
      
      const result = execSync(`${pingCommand} ${pingArgs.join(' ')}`, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: 'pipe'
      }) as string;
      
      // Check if ping was successful (look for success indicators)
      const isHealthy = isWindows 
        ? result.includes('Reply from') || result.includes('bytes=') 
        : result.includes('bytes from') || !result.includes('100% packet loss');
      
      if (!isHealthy) {
        return {
          healthy: false,
          message: 'WireGuard interface (198.51.100.1) not reachable via ping'
        };
      }
      
      this.logger.debug('WireGuard interface ping successful');
      return {
        healthy: true,
        message: 'WireGuard interface is reachable'
      };
      
    } catch (error: any) {
      this.logger.debug('WireGuard ping test failed', { error: error.message });
      return {
        healthy: false,
        message: `WireGuard ping test failed: ${error.message}`
      };
    }
  }

  /**
   * Ensure base directory exists
   */
  private ensureBaseDirectory(): void {
    if (!fs.existsSync(this.baseCwd)) {
      this.logger.info('Creating base directory for user-specific files', { path: this.baseCwd });
      fs.mkdirSync(this.baseCwd, { recursive: true });
    } else {
      this.logger.debug('Base directory already exists', { path: this.baseCwd });
    }
  }

  /**
   * Get or create user-specific directory for file downloads
   */
  private ensureUserDirectory(user?: string): string {
    const currentUser = user || 'current-user';
    const userDir = path.join(this.baseCwd, currentUser);
    
    if (!fs.existsSync(userDir)) {
      this.logger.info('Creating user directory for file downloads', { 
        user: currentUser, 
        path: userDir 
      });
      fs.mkdirSync(userDir, { recursive: true });
    } else {
      this.logger.debug('User directory already exists', { 
        user: currentUser, 
        path: userDir 
      });
    }
    
    return userDir;
  }



  /**
   * Cleanup resources including SSH tunnel manager
   */
  async cleanup(): Promise<void> {
    // Use new tunnel manager if available
    if (this.tunnelManager) {
      try {
        await this.tunnelManager.disconnect();
        this.logger.info('SSH tunnel manager disconnected successfully');
      } catch (error) {
        this.logger.error('Error disconnecting SSH tunnel manager', { error });
      }
    } else {
      // Fallback to old cleanup methods
      // this.closeSSHTunnel(); // Removed
      // this.closeRegularOperationsTunnel(); // Removed
    }
    
    // Clear any remaining environment variables
    delete process.env.LUDUS_API_KEY;
    delete process.env.LUDUS_URL;
    delete process.env.LUDUS_VERIFY;
    delete process.env.LUDUS_JSON;
  }
} 