import { Client as SSHClient } from 'ssh2';
import net from 'net';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Logger } from '../utils/logger.js';

// Lock file paths (Windows compatible)
const LOCK_DIR = path.join(os.tmpdir(), 'ludus_mcp_tunnel');
const TUNNEL_LOCK_FILE = path.join(LOCK_DIR, 'tunnel.lock');
const REFS_FILE = path.join(LOCK_DIR, 'refs.json');

interface TunnelState {
    pid: number;
    regularPort: number;
    primaryPort: number;
    refCount: number;
    startTime: number;
}

interface TunnelReference {
    pid: number;
    startTime: number;
}

export interface SSHTunnelConfig {
    host: string;
    port: number;
    username: string;
    privateKeyPath: string;
    privateKeyPassphrase?: string;  // Optional passphrase for password-protected keys
    regularPort: number;  // 8080
    primaryPort: number;  // 8081
}

export class LudusSSHTunnelManager {
    private sshConfig: SSHTunnelConfig;
    private logger: Logger;
    private sshConnection?: SSHClient;
    private regularTunnelServer?: net.Server;
    private primaryTunnelServer?: net.Server;
    private instanceId: string;

    constructor(sshConfig: SSHTunnelConfig, logger: Logger) {
        this.sshConfig = sshConfig;
        this.logger = logger;
        this.instanceId = `${process.pid}-${Date.now()}`;
    }

    async connect(): Promise<void> {
        await this.ensureLockDir();
        
        // Try to acquire lock for tunnel management
        const lockAcquired = await this.acquireLock();
        
        if (lockAcquired) {
            // We're the first instance or taking over from a dead instance
            this.logger.info('Acquiring tunnel lock, starting SSH tunnels');
            await this.startTunnels();
        } else {
            // Another instance is managing the tunnel
            this.logger.info('Existing tunnel found, waiting for availability');
            await this.waitForTunnels();
        }
        
        // Register this instance
        await this.addReference();
    }

    async disconnect(): Promise<void> {
        const shouldShutdownTunnel = await this.removeReference();
        
        if (shouldShutdownTunnel) {
            this.logger.info('Last instance disconnecting, shutting down SSH tunnels');
            
            if (this.regularTunnelServer) {
                this.regularTunnelServer.close();
            }
            if (this.primaryTunnelServer) {
                this.primaryTunnelServer.close();
            }
            if (this.sshConnection) {
                this.sshConnection.end();
            }
            
            await this.releaseLock();
        }
    }

    /**
     * Check if tunnels are healthy and responding
     */
    async checkTunnelHealth(): Promise<{ regularHealthy: boolean; primaryHealthy: boolean }> {
        const regularHealthy = await this.isTunnelPortOpen(this.sshConfig.regularPort, 3); // Quick check, 3 attempts
        const primaryHealthy = await this.isTunnelPortOpen(this.sshConfig.primaryPort, 3);
        
        this.logger.debug('Tunnel health check completed', {
            regularPort: this.sshConfig.regularPort,
            regularHealthy,
            primaryPort: this.sshConfig.primaryPort,
            primaryHealthy
        });
        
        return { regularHealthy, primaryHealthy };
    }

    /**
     * Attempt to reconnect tunnels if they're not healthy
     */
    async ensureTunnelsHealthy(): Promise<void> {
        const health = await this.checkTunnelHealth();
        
        if (!health.regularHealthy || !health.primaryHealthy) {
            this.logger.warn('Tunnels not healthy, attempting recovery', {
                regularHealthy: health.regularHealthy,
                primaryHealthy: health.primaryHealthy
            });
            
            // Try to reconnect
            try {
                await this.reconnectTunnels();
            } catch (error) {
                this.logger.error('Failed to reconnect tunnels', { error });
                throw new Error(`Tunnel reconnection failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Reconnect SSH tunnels
     */
    private async reconnectTunnels(): Promise<void> {
        // Close existing connections
        if (this.regularTunnelServer) {
            this.regularTunnelServer.close();
        }
        if (this.primaryTunnelServer) {
            this.primaryTunnelServer.close();
        }
        if (this.sshConnection) {
            this.sshConnection.end();
        }

        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Re-establish tunnels
        await this.startTunnels();
        
        this.logger.info('SSH tunnels reconnected successfully');
    }

    private async ensureLockDir(): Promise<void> {
        try {
            await fs.mkdir(LOCK_DIR, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }

    private async acquireLock(): Promise<boolean> {
        try {
            // Check if lock exists and if the process is still running
            const lockData = await this.readLockFile();
            if (lockData && await this.isProcessRunning(lockData.pid)) {
                return false;
            }
            
            // Create or update lock file
            await this.writeLockFile({
                pid: process.pid,
                regularPort: this.sshConfig.regularPort,
                primaryPort: this.sshConfig.primaryPort,
                refCount: 0,
                startTime: Date.now()
            });
            
            return true;
        } catch (error) {
            // If we can't read the lock, try to create it
            try {
                await this.writeLockFile({
                    pid: process.pid,
                    regularPort: this.sshConfig.regularPort,
                    primaryPort: this.sshConfig.primaryPort,
                    refCount: 0,
                    startTime: Date.now()
                });
                return true;
            } catch {
                return false;
            }
        }
    }

    private async releaseLock(): Promise<void> {
        try {
            await fs.unlink(TUNNEL_LOCK_FILE);
            await fs.unlink(REFS_FILE);
        } catch (error) {
            // Files might not exist
        }
    }

    private async readLockFile(): Promise<TunnelState | null> {
        try {
            const data = await fs.readFile(TUNNEL_LOCK_FILE, 'utf-8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    private async writeLockFile(state: TunnelState): Promise<void> {
        await fs.writeFile(TUNNEL_LOCK_FILE, JSON.stringify(state, null, 2));
    }

    private async isProcessRunning(pid: number): Promise<boolean> {
        try {
            // Send signal 0 to check if process exists
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private async isTunnelPortOpen(port: number, maxAttempts = 30): Promise<boolean> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const isOpen = await new Promise<boolean>((resolve) => {
                    const socket = new net.Socket();
                    
                    socket.once('connect', () => {
                        socket.end();
                        resolve(true);
                    });
                    
                    socket.once('error', () => {
                        resolve(false);
                    });
                    
                    socket.connect(port, '127.0.0.1');
                });
                
                if (isOpen) return true;
            } catch {
                // Continue trying
            }
            
            // Wait 1 second before trying again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return false;
    }

    private async startTunnels(): Promise<void> {
        return new Promise((resolve, reject) => {
            const ssh = new SSHClient();

            ssh.on('ready', () => {
                this.logger.info('SSH connection established for tunnel manager');
                
                // Create regular operations tunnel (8080)
                this.regularTunnelServer = net.createServer((socket) => {
                    ssh.forwardOut(
                        socket.remoteAddress ?? '',
                        socket.remotePort ?? 0,
                        '127.0.0.1',
                        8080,
                        (err: Error | undefined, stream: any) => {
                            if (err) {
                                socket.end();
                                return this.logger.error('Regular tunnel forward error', { error: err });
                            }
                            
                            // Handle connection errors gracefully
                            socket.on('error', (socketErr) => {
                                this.logger.warn('Regular tunnel socket error', { error: socketErr });
                                socket.destroy();
                            });
                            
                            stream.on('error', (streamErr: Error) => {
                                this.logger.warn('Regular tunnel stream error', { error: streamErr });
                                socket.destroy();
                            });
                            
                            socket.pipe(stream).pipe(socket);
                        }
                    );
                });

                // Create primary operations tunnel (8081)
                this.primaryTunnelServer = net.createServer((socket) => {
                    ssh.forwardOut(
                        socket.remoteAddress ?? '',
                        socket.remotePort ?? 0,
                        '127.0.0.1',
                        8081,
                        (err: Error | undefined, stream: any) => {
                            if (err) {
                                socket.end();
                                return this.logger.error('Primary tunnel forward error', { error: err });
                            }
                            
                            // Handle connection errors gracefully
                            socket.on('error', (socketErr) => {
                                this.logger.warn('Primary tunnel socket error', { error: socketErr });
                                socket.destroy();
                            });
                            
                            stream.on('error', (streamErr: Error) => {
                                this.logger.warn('Primary tunnel stream error', { error: streamErr });
                                socket.destroy();
                            });
                            
                            socket.pipe(stream).pipe(socket);
                        }
                    );
                });

                // Start both tunnel servers
                let serversStarted = 0;
                const onServerReady = () => {
                    serversStarted++;
                    if (serversStarted === 2) {
                        this.logger.info('Both SSH tunnels established', {
                            regularPort: this.sshConfig.regularPort,
                            primaryPort: this.sshConfig.primaryPort
                        });
                        this.sshConnection = ssh;
                        resolve();
                    }
                };

                this.regularTunnelServer.listen(this.sshConfig.regularPort, '127.0.0.1', onServerReady);
                this.primaryTunnelServer.listen(this.sshConfig.primaryPort, '127.0.0.1', onServerReady);

                this.regularTunnelServer.on('error', (err) => {
                    this.logger.error('Regular tunnel server error', { error: err });
                    reject(err);
                });

                this.primaryTunnelServer.on('error', (err) => {
                    this.logger.error('Primary tunnel server error', { error: err });
                    reject(err);
                });
            });

            ssh.on('error', (err: Error) => {
                // Provide specific error messages for common SSH key issues
                if (err.message.includes('Encrypted private key detected, but no passphrase given')) {
                    this.logger.error('SSH key is password-protected but no passphrase was provided', { error: err });
                    reject(new Error('SSH key is password-protected. Please run setup again and provide the passphrase.'));
                } else if (err.message.includes('Cannot parse privateKey')) {
                    this.logger.error('SSH key passphrase is incorrect or key is corrupted', { error: err });
                    reject(new Error('SSH key passphrase is incorrect or the key file is corrupted. Please run setup again.'));
                } else {
                    this.logger.error('SSH connection error', { error: err });
                    reject(err);
                }
            });

            ssh.on('close', () => {
                this.logger.warn('SSH connection closed unexpectedly');
                // Clean up tunnel servers if they exist
                if (this.regularTunnelServer) {
                    this.regularTunnelServer.close();
                }
                if (this.primaryTunnelServer) {
                    this.primaryTunnelServer.close();
                }
            });

            // Load private key and connect
            fs.readFile(this.sshConfig.privateKeyPath)
                .then(keyBuffer => {
                    const connectConfig = {
                        host: this.sshConfig.host,
                        port: this.sshConfig.port,
                        username: this.sshConfig.username,
                        privateKey: keyBuffer,
                        ...(this.sshConfig.privateKeyPassphrase && { 
                            passphrase: this.sshConfig.privateKeyPassphrase 
                        }),
                        // Add connection resilience settings
                        readyTimeout: 20000, // 20 seconds to connect
                        keepaliveInterval: 60000, // Send keepalive every 60 seconds
                        keepaliveCountMax: 3 // Drop after 3 failed keepalives
                    };
                    
                    this.logger.info('Connecting to SSH host', {
                        host: this.sshConfig.host,
                        port: this.sshConfig.port,
                        username: this.sshConfig.username,
                        hasPassphrase: !!this.sshConfig.privateKeyPassphrase
                    });
                    ssh.connect(connectConfig);
                })
                .catch((err: Error) => {
                    this.logger.error('Failed to read private key', { 
                        path: this.sshConfig.privateKeyPath, 
                        error: err 
                    });
                    reject(err);
                });
        });
    }

    private async waitForTunnels(): Promise<void> {
        this.logger.info('Waiting for existing SSH tunnels...');
        
        const lockData = await this.readLockFile();
        if (!lockData) {
            throw new Error('No tunnel lock file found');
        }
        
        const regularPortOpen = await this.isTunnelPortOpen(lockData.regularPort);
        const primaryPortOpen = await this.isTunnelPortOpen(lockData.primaryPort);
        
        if (!regularPortOpen || !primaryPortOpen) {
            throw new Error('Tunnel ports are not open after waiting');
        }
        
        this.logger.info('Connected to existing SSH tunnels', {
            regularPort: lockData.regularPort,
            primaryPort: lockData.primaryPort
        });
    }

    private async addReference(): Promise<void> {
        const refs = await this.readReferences();
        refs[this.instanceId] = {
            pid: process.pid,
            startTime: Date.now()
        };
        await this.writeReferences(refs);
        
        // Update ref count in lock file
        const lockData = await this.readLockFile();
        if (lockData) {
            lockData.refCount = Object.keys(refs).length;
            await this.writeLockFile(lockData);
        }
    }

    private async removeReference(): Promise<boolean> {
        const refs = await this.readReferences();
        delete refs[this.instanceId];
        
        // Clean up dead references
        for (const [id, ref] of Object.entries(refs)) {
            if (!await this.isProcessRunning(ref.pid)) {
                delete refs[id];
            }
        }
        
        await this.writeReferences(refs);
        
        // Update ref count in lock file
        const lockData = await this.readLockFile();
        if (lockData) {
            lockData.refCount = Object.keys(refs).length;
            await this.writeLockFile(lockData);
        }
        
        // Return true if this was the last reference
        return Object.keys(refs).length === 0;
    }

    private async readReferences(): Promise<Record<string, TunnelReference>> {
        try {
            const data = await fs.readFile(REFS_FILE, 'utf-8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    private async writeReferences(refs: Record<string, TunnelReference>): Promise<void> {
        await fs.writeFile(REFS_FILE, JSON.stringify(refs, null, 2));
    }
} 