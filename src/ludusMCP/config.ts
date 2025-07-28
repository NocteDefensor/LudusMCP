import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import yaml from 'js-yaml';
import { Logger } from '../utils/logger.js';

export interface LudusConfigOptions {
  url?: string;
  apiKey?: string;
  skipCertVerification?: boolean;
  proxyUrl?: string;
  timeout?: number;
  sshHost?: string;
  sshUser?: string;
}

export class LudusConfig {
  private logger: Logger;
  private config: LudusConfigOptions;

  constructor(logger: Logger) {
    this.logger = logger;
    this.config = this.loadConfig();
  }

  private loadConfig(): LudusConfigOptions {
    const config: LudusConfigOptions = {};

    // Load from config file first
    const configPath = join(homedir(), '.config', 'ludus', 'config.yml');
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf8');
        const fileConfig = yaml.load(fileContent) as any;
        
        // Map config file keys to our interface
        if (fileConfig.url) config.url = fileConfig.url;
        if (fileConfig.verify !== undefined) config.skipCertVerification = !fileConfig.verify;
        if (fileConfig.proxy) config.proxyUrl = fileConfig.proxy;
        if (fileConfig.ssh_host) config.sshHost = fileConfig.ssh_host;
        if (fileConfig.ssh_user) config.sshUser = fileConfig.ssh_user;
        this.logger.debug('Loaded config from file', { path: configPath });
      } catch (error) {
        this.logger.warn('Failed to load config file', { 
        path: configPath, 
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      });
      }
    }

    // Override with environment variables
    if (process.env.LUDUS_URL) {
      config.url = process.env.LUDUS_URL;
    }
    if (process.env.LUDUS_API_KEY) {
      config.apiKey = process.env.LUDUS_API_KEY;
    }
    if (process.env.LUDUS_VERIFY) {
      config.skipCertVerification = process.env.LUDUS_VERIFY === 'false';
    }
    if (process.env.LUDUS_PROXY) {
      config.proxyUrl = process.env.LUDUS_PROXY;
    }
    if (process.env.LUDUS_TIMEOUT) {
      config.timeout = parseInt(process.env.LUDUS_TIMEOUT, 10);
    }
    if (process.env.LUDUS_SSH_HOST) {
      config.sshHost = process.env.LUDUS_SSH_HOST;
    }
    if (process.env.LUDUS_SSH_USER) {
      config.sshUser = process.env.LUDUS_SSH_USER;
    }

    // Set defaults
    if (!config.skipCertVerification) {
      config.skipCertVerification = false;
    }
    if (!config.timeout) {
      config.timeout = 30000; // 30 seconds
    }

    return config;
  }

  public getUrl(): string {
    if (!this.config.url) {
      throw new Error('Ludus URL not configured. Set LUDUS_URL environment variable or configure in ~/.config/ludusMCP/config.yml');
    }
    return this.config.url;
  }

  public getApiKey(): string {
    if (!this.config.apiKey) {
      throw new Error('Ludus API key not configured. Set LUDUS_API_KEY environment variable or configure in ~/.config/ludusMCP/config.yml');
    }
    return this.config.apiKey;
  }

  public getSkipCertVerification(): boolean {
    return this.config.skipCertVerification || false;
  }

  public getProxyUrl(): string | undefined {
    return this.config.proxyUrl;
  }

  public getTimeout(): number {
    return this.config.timeout || 30000;
  }

  public getSSHHost(): string | undefined {
    return this.config.sshHost;
  }

  public getSSHUser(): string | undefined {
    return this.config.sshUser;
  }

  public validateConfig(): void {
    const url = this.getUrl();
    const apiKey = this.getApiKey();

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid Ludus URL format: ${url}`);
    }

    // Validate API key format (USERID.{40-char-key})
    const apiKeyPattern = /^[^.]+\.[a-zA-Z0-9]{40}$/;
    if (!apiKeyPattern.test(apiKey)) {
      throw new Error('Invalid API key format. Expected format: USERID.{40-character-key}');
    }

    this.logger.info('Configuration validated successfully', {
      url,
      apiKeyUser: apiKey.split('.')[0],
      skipCertVerification: this.getSkipCertVerification(),
      timeout: this.getTimeout()
    });
  }

  public getConfig(): LudusConfigOptions {
    return { ...this.config };
  }
} 