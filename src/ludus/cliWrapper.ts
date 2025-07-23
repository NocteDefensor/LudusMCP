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
    if (!this.config.sshHost || !this.config.sshKeyPath) {
      throw new Error('SSH configuration is incomplete');
    }

    const tunnelConfig: SSHTunnelConfig = {
      host: this.config.sshHost,
      port: 22, // Default SSH port
      username: this.config.sshUser || 'root',
      privateKeyPath: this.config.sshKeyPath || '',
      regularPort: 8080,
      primaryPort: 8081,
      ...(this.config.sshKeyPassphrase && { privateKeyPassphrase: this.config.sshKeyPassphrase })
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
   * Create SSH tunnel for admin operations
   */
  private async createSSHTunnel(): Promise<boolean> {
    try {
      if (this.sshTunnelPid) {
        this.logger.debug('SSH tunnel already exists');
        return true;
      }

      this.logger.info('Creating SSH tunnel for admin operations', {
        sshHost: this.config.sshHost,
        sshUser: this.config.sshUser,
        localPort: this.sshTunnelPort
      });

      // Create SSH tunnel using configured authentication method
      let sshCommand: string[];
      
      if (this.config.sshAuthMethod === 'key') {
        // Key-based authentication
        sshCommand = [
          'ssh',
          '-i', this.config.sshKeyPath!,
          '-L', `${this.sshTunnelPort}:127.0.0.1:8081`,
          '-N', '-T',
          '-o', 'ConnectTimeout=10',
          '-o', 'StrictHostKeyChecking=no',
          `${this.config.sshUser}@${this.config.sshHost}`
        ];
      } else if (this.config.sshAuthMethod === 'plink') {
        // Windows plink with password
        sshCommand = [
          'plink',
          '-batch',
          '-ssh',
          '-pw', this.config.sshPassword!,
          '-L', `${this.sshTunnelPort}:127.0.0.1:8081`,
          '-N',
          `${this.config.sshUser}@${this.config.sshHost}`
        ];
      } else {
        // Password authentication with sshpass (Linux)
        sshCommand = [
          'sshpass',
          '-p', this.config.sshPassword!,
          'ssh',
          '-L', `${this.sshTunnelPort}:127.0.0.1:8081`,
          '-N', '-T',
          '-o', 'ConnectTimeout=10',
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'PasswordAuthentication=yes',
          `${this.config.sshUser}@${this.config.sshHost}`
        ];
      }

      this.logger.info('Creating SSH tunnel...', { 
        authMethod: this.config.sshAuthMethod,
        message: this.config.sshAuthMethod === 'key' ? 'Using SSH key' : 'Using password authentication',
        fullCommand: sshCommand.join(' ')
      });
      
      const tunnelProcess = spawn(sshCommand[0], sshCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'], // Always use pipe to avoid interfering with MCP protocol stdin
        detached: false,
        env: {
          ...process.env,
          PATH: process.env.PATH + ';C:\\Windows\\System32\\OpenSSH', // Ensure SSH is in PATH
          HOME: process.env.USERPROFILE // Ensure HOME is set for SSH
        },
        cwd: process.env.USERPROFILE // Run from user's home directory for SSH key access
      });

      this.sshTunnelPid = tunnelProcess.pid || null;

      // Wait for tunnel to establish
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test tunnel connectivity with cross-platform approach
      try {
        // Use a Windows-compatible test method
        const isWindows = process.platform === 'win32';
        
        if (isWindows) {
          // On Windows, use PowerShell to test TCP connection
          const testCommand = `powershell -Command "Test-NetConnection -ComputerName localhost -Port ${this.sshTunnelPort} -InformationLevel Quiet"`;
          const result = execSync(testCommand, { timeout: 5000, stdio: 'pipe', encoding: 'utf8' });
          
          if (result.trim().toLowerCase() === 'true') {
            this.logger.info('SSH tunnel established successfully (PowerShell test)', { pid: this.sshTunnelPid });
            return true;
          }
        } else {
          // On Linux/macOS, use nc if available
          const testCommand = `nc -z localhost ${this.sshTunnelPort}`;
          execSync(testCommand, { timeout: 5000, stdio: 'pipe' });
          
          this.logger.info('SSH tunnel established successfully (nc test)', { pid: this.sshTunnelPid });
          return true;
        }
      } catch (error) {
        this.logger.warn('Primary tunnel test failed, trying curl test', { 
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : String(error)
        });
      }
      
      // Fallback to curl test (cross-platform)
      try {
        execSync(`curl -k -s -o /dev/null -w "%{http_code}" https://127.0.0.1:${this.sshTunnelPort}/ --connect-timeout 5`, {
          timeout: 8000,
          stdio: 'pipe'
        });
        
        this.logger.info('SSH tunnel established successfully (curl test)', { pid: this.sshTunnelPid });
        return true;
      } catch (curlError) {
        this.logger.error('SSH tunnel establishment failed', { error: curlError });
        this.closeSSHTunnel();
        return false;
      }
    } catch (error: any) {
      this.logger.error('Failed to create SSH tunnel', error);
      return false;
    }
  }

  /**
   * Close SSH tunnel
   */
  private closeSSHTunnel(): void {
    if (this.sshTunnelPid) {
      try {
        process.kill(this.sshTunnelPid);
        this.sshTunnelPid = null;
        this.logger.info('SSH tunnel closed');
      } catch (error) {
        this.logger.error('Failed to close SSH tunnel', { error });
      }
    }
  }

  /**
   * Create SSH tunnel for regular operations (port 8080)
   */
  private async createRegularOperationsTunnel(): Promise<boolean> {
    if (this.regularTunnelPid) {
      this.logger.debug('Regular operations SSH tunnel already exists');
      return true;
    }

    this.logger.info('Creating SSH tunnel for regular operations (port 8080)');
    this.setupSSHTunnelRegularEnvironment();

    try {
      let sshCommand: string[];
      if (this.config.sshAuthMethod === 'key') {
        // Verify SSH key exists and log detailed info
        if (!this.config.sshKeyPath) {
          throw new Error('SSH key path is not configured but key authentication is selected');
        }
        
        let keyPath = this.config.sshKeyPath;
        
        try {
          // Convert to absolute path if needed
          if (!path.isAbsolute(keyPath)) {
            keyPath = path.resolve(keyPath);
          }
          
          this.logger.info('SSH key verification', {
            originalPath: this.config.sshKeyPath,
            absolutePath: keyPath,
            exists: fs.existsSync(keyPath),
            workingDir: process.cwd(),
            userHome: process.env.USERPROFILE || process.env.HOME
          });
          
          if (!fs.existsSync(keyPath)) {
            throw new Error(`SSH key file not found: ${keyPath}`);
          }
        } catch (pathError: any) {
          this.logger.error('SSH key path validation failed', {
            originalPath: this.config.sshKeyPath,
            error: pathError.message,
            workingDir: process.cwd()
          });
          throw new Error(`Invalid SSH key path: ${pathError.message}`);
        }
        
        sshCommand = [
          'ssh',
          '-i', keyPath, // Use absolute path
          '-L', '8080:127.0.0.1:8080', // Map local port 8080 to Ludus server port 8080
          '-N', '-T',
          '-o', 'ConnectTimeout=10',
          '-o', 'StrictHostKeyChecking=no',
          '-v', // Add verbose mode to see SSH debug info
          `${this.config.sshUser}@${this.config.sshHost}`
        ];
      } else if (this.config.sshAuthMethod === 'plink') {
        sshCommand = [
          'plink',
          '-batch',
          '-ssh',
          '-pw', this.config.sshPassword!,
          '-L', '8080:127.0.0.1:8080', // Map local port 8080 to Ludus server port 8080
          '-N',
          `${this.config.sshUser}@${this.config.sshHost}`
        ];
      } else {
        sshCommand = [
          'sshpass',
          '-p', this.config.sshPassword!,
          'ssh',
          '-L', '8080:127.0.0.1:8080', // Map local port 8080 to Ludus server port 8080
          '-N', '-T',
          '-o', 'ConnectTimeout=10',
          '-o', 'StrictHostKeyChecking=no',
          '-o', 'PasswordAuthentication=yes',
          `${this.config.sshUser}@${this.config.sshHost}`
        ];
      }

      this.logger.info('Creating regular operations SSH tunnel...', { 
        authMethod: this.config.sshAuthMethod,
        message: this.config.sshAuthMethod === 'key' ? 'Using SSH key' : 'Using password authentication',
        command: sshCommand.join(' '),
        env: {
          PATH: process.env.PATH?.substring(0, 200) + '...',
          PWD: process.cwd(),
          SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK || 'not set'
        }
      });

      // Check if SSH binary exists
      const sshBinary = sshCommand[0];
      this.logger.info('SSH binary check', { 
        sshBinary, 
        fullPath: 'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
        pathEnv: process.env.PATH?.includes('OpenSSH') ? 'SSH in PATH' : 'SSH not in PATH'
      });
      
      // Test SSH execution directly
      this.logger.info('Testing SSH execution directly');
      try {
        const sshTestProcess = spawn('ssh', ['-V'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: process.env.PATH + ';C:\\Windows\\System32\\OpenSSH', // Ensure SSH is in PATH
            HOME: process.env.USERPROFILE // Ensure HOME is set for SSH
          },
          cwd: process.env.USERPROFILE // Run from user's home directory for SSH key access
        });

        let testOutput = '';
        let testError = '';

        sshTestProcess.stdout.on('data', (data) => {
          testOutput += data.toString();
        });

        sshTestProcess.stderr.on('data', (data) => {
          testError += data.toString();
        });

        await new Promise<void>((resolve) => {
          sshTestProcess.on('exit', (code) => {
            this.logger.info('SSH version test completed', {
              exitCode: code,
              stdout: testOutput.trim() || '[empty]',
              stderr: testError.trim() || '[empty]',
              stdoutLength: testOutput.length,
              stderrLength: testError.length
            });
            
            // If SSH completely failed, try with full path
            if (code === 255 && testOutput.length === 0 && testError.length === 0) {
              this.logger.info('SSH -V failed, trying full path to SSH');
              try {
                const fullPathTest = spawn('C:\\Windows\\System32\\OpenSSH\\ssh.exe', ['-V'], {
                  stdio: ['pipe', 'pipe', 'pipe'],
                  env: {
                    ...process.env,
                    HOME: process.env.USERPROFILE
                  },
                  cwd: process.env.USERPROFILE
                });
                
                let fullPathOutput = '';
                let fullPathError = '';
                
                fullPathTest.stdout.on('data', (data) => {
                  fullPathOutput += data.toString();
                });
                
                fullPathTest.stderr.on('data', (data) => {
                  fullPathError += data.toString();
                });
                
                fullPathTest.on('exit', (fullPathCode) => {
                  this.logger.info('SSH full path test completed', {
                    exitCode: fullPathCode,
                    stdout: fullPathOutput.trim() || '[empty]',
                    stderr: fullPathError.trim() || '[empty]',
                    stdoutLength: fullPathOutput.length,
                    stderrLength: fullPathError.length
                  });
                });
              } catch (fullPathError) {
                this.logger.error('SSH full path test failed', { 
                  error: fullPathError instanceof Error ? {
                    name: fullPathError.name,
                    message: fullPathError.message
                  } : String(fullPathError)
                });
              }
            }
            
            resolve();
          });

          // Timeout after 5 seconds
          setTimeout(() => {
            sshTestProcess.kill();
            this.logger.warn('SSH version test timed out');
            resolve();
          }, 5000);
        });
      } catch (testError) {
        this.logger.error('SSH version test failed', { error: testError });
      }

      this.logger.info('Attempting to spawn SSH tunnel process directly', { 
        binary: sshCommand[0],
        fullCommand: sshCommand.join(' ')
      });

      const tunnelProcess = spawn(sshCommand[0], sshCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'], // Always use pipe to avoid interfering with MCP protocol stdin
        detached: false,
        env: {
          ...process.env,
          PATH: process.env.PATH + ';C:\\Windows\\System32\\OpenSSH', // Ensure SSH is in PATH
          HOME: process.env.USERPROFILE // Ensure HOME is set for SSH
        },
        cwd: process.env.USERPROFILE // Run from user's home directory for SSH key access
      });

      this.regularTunnelPid = tunnelProcess.pid || null;
      
      this.logger.info('SSH process spawned', { 
        pid: this.regularTunnelPid,
        spawned: !!tunnelProcess.pid
      });

      // Log SSH process events
      tunnelProcess.on('error', (error) => {
        this.logger.error('SSH tunnel process error', { 
          error: error.message,
          code: (error as any).code,
          syscall: (error as any).syscall,
          path: (error as any).path
        });
      });

      tunnelProcess.on('exit', (code, signal) => {
        this.logger.info('SSH tunnel process exited', { 
          code, 
          signal,
          pid: this.regularTunnelPid
        });
        this.regularTunnelPid = null;
      });

      // Enhanced SSH output capture debugging
      let sshErrors = '';
      let sshOutput = '';
      
      this.logger.info('Setting up SSH output capture handlers');

      tunnelProcess.stderr.on('data', (data) => {
        const output = data.toString();
        const trimmed = output.trim();
        sshErrors += output;
        this.logger.warn('SSH tunnel stderr received', { 
          rawLength: output.length,
          trimmedLength: trimmed.length,
          output: trimmed || '[empty after trim]',
          raw: output.length < 100 ? JSON.stringify(output) : '[too long to show]'
        });
      });

      tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        const trimmed = output.trim();
        sshOutput += output;
        this.logger.info('SSH tunnel stdout received', { 
          rawLength: output.length,
          trimmedLength: trimmed.length,
          output: trimmed || '[empty after trim]',
          raw: output.length < 100 ? JSON.stringify(output) : '[too long to show]'
        });
      });

      // Enhanced exit logging to see all output
      tunnelProcess.on('exit', (code, signal) => {
        this.logger.error('SSH tunnel process exited', {
          exitCode: code,
          signal: signal,
          pid: this.regularTunnelPid,
          hasStderr: sshErrors.length > 0,
          hasStdout: sshOutput.length > 0,
          stderrLength: sshErrors.length,
          stdoutLength: sshOutput.length,
          command: sshCommand.join(' ')
        });
        
        if (sshErrors.length > 0) {
          this.logger.error('SSH stderr content', {
            content: sshErrors.trim()
          });
        } else {
          this.logger.warn('SSH produced NO stderr output (this is unusual with -v flag)');
        }
        
        if (sshOutput.length > 0) {
          this.logger.info('SSH stdout content', {
            content: sshOutput.trim()
          });
        }
      });

       // Wait longer for tunnel to establish - regular ops tunnel needs more time
       await new Promise(resolve => setTimeout(resolve, 6000));

      // Test tunnel connectivity with cross-platform approach
      try {
        const isWindows = process.platform === 'win32';
        if (isWindows) {
          const testCommand = `powershell -Command "Test-NetConnection -ComputerName localhost -Port 8080 -InformationLevel Quiet"`;
          const result = execSync(testCommand, { timeout: 5000, stdio: 'pipe', encoding: 'utf8' });
          if (result.trim().toLowerCase() === 'true') {
            this.logger.info('Regular operations SSH tunnel established successfully (PowerShell test)', { pid: this.regularTunnelPid });
            return true;
          }
        } else {
          const testCommand = `nc -z localhost 8080`;
          execSync(testCommand, { timeout: 5000, stdio: 'pipe' });
          this.logger.info('Regular operations SSH tunnel established successfully (nc test)', { pid: this.regularTunnelPid });
          return true;
        }
      } catch (error) {
        this.logger.warn('Regular operations SSH tunnel test failed, trying curl test', { 
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : String(error)
        });
      }

      // Fallback to curl test (cross-platform)
      try {
        execSync(`curl -k -s -o /dev/null -w "%{http_code}" https://127.0.0.1:8080/ --connect-timeout 5`, {
          timeout: 8000,
          stdio: 'pipe'
        });
        this.logger.info('Regular operations SSH tunnel established successfully (curl test)', { pid: this.regularTunnelPid });
        return true;
      } catch (curlError) {
        this.logger.error('Regular operations SSH tunnel establishment failed', { error: curlError });
        this.closeRegularOperationsTunnel();
        return false;
      }
    } catch (error: any) {
      this.logger.error('Failed to create regular operations SSH tunnel', error);
      return false;
    }
  }

  /**
   * Close regular operations SSH tunnel
   */
  private closeRegularOperationsTunnel(): void {
    if (this.regularTunnelPid) {
      try {
        process.kill(this.regularTunnelPid);
        this.regularTunnelPid = null;
        this.logger.info('Regular operations SSH tunnel closed');
      } catch (error) {
        this.logger.error('Failed to close regular operations SSH tunnel', { error });
      }
    }
  }

  /**
   * Execute command with smart routing
   */
  async executeCommand(command: string, args: string[] = [], workingDirectory?: string): Promise<CommandResult> {
    const originalCwd = process.cwd();
    
    try {
      // Use specified working directory or default to ~/.ludus-mcp/
      const targetCwd = workingDirectory || this.baseCwd;
      process.chdir(targetCwd);
      
      // Build command string for admin check and logging only (not execution)
      const fullCommand = `${command} ${args.join(' ')}`.trim();
      const isAdmin = this.isAdminCommand(fullCommand);

      const actualRoute = isAdmin ? 'SSH tunnel' : 
        (this.config.connectionMethod === 'ssh-tunnel' ? 'SSH tunnel' : 'WireGuard VPN');
      
      this.logger.info('Executing Ludus command', { 
        command: fullCommand, 
        isAdmin,
        route: actualRoute,
        workingDirectory: targetCwd
      });

      // Ensure connections are healthy before executing commands
      let usingSSHFallback = false;
      
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

      // Parse JSON output if available
      let parsedData = null;
      try {
        parsedData = JSON.parse(output);
      } catch (error) {
        // Not JSON, use raw output
        parsedData = output;
      }

      // Close SSH tunnel if it was created for this command
      if (isAdmin) {
        this.closeSSHTunnel();
      }

      // Clear environment variables
      delete process.env.LUDUS_API_KEY;
      delete process.env.LUDUS_URL;
      delete process.env.LUDUS_VERIFY;
      delete process.env.LUDUS_JSON;

      return {
        success: true,
        data: parsedData,
        message: `Command executed successfully via ${isAdmin ? 'SSH tunnel' : 'WireGuard VPN'}`,
        rawOutput: output
      };
    } catch (error: any) {
      this.logger.error('Command execution failed', { 
        command, 
        error: error.message,
        stderr: error.stderr?.toString()
      });

      // Clean up on error
      if (this.isAdminCommand(`${command} ${args.join(' ')}`)) {
        this.closeSSHTunnel();
      }

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
    const args = ['on'];
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
    const args = ['off'];
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
    if (this.config.connectionMethod === 'wireguard') {
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
      this.closeSSHTunnel();
      this.closeRegularOperationsTunnel();
    }
    
    // Clear any remaining environment variables
    delete process.env.LUDUS_API_KEY;
    delete process.env.LUDUS_URL;
    delete process.env.LUDUS_VERIFY;
    delete process.env.LUDUS_JSON;
  }
} 