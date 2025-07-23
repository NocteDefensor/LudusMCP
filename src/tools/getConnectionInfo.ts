import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';
import * as os from 'os';
import * as path from 'path';

export interface GetConnectionInfoArgs {
  user?: string;
  connectionType?: 'rdp' | 'wireguard' | 'etc-hosts' | 'all';
  help?: boolean;
}

export function createGetConnectionInfoTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'get_connection_info',
    description: 'Get connection information for accessing a Ludus range. Supports RDP configurations, WireGuard VPN configs, and host file entries. Requires admin privileges to get info for other users.',
    inputSchema: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'User ID to get connection info for (admin only). If omitted, gets info for current user.'
        },
        connectionType: {
          type: 'string',
          enum: ['rdp', 'wireguard', 'etc-hosts', 'all'],
          description: 'Type of connection information to retrieve',
          default: 'all'
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the get_connection_info command',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleGetConnectionInfo(
  args: GetConnectionInfoArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { user, connectionType = 'all', help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for get_connection_info command', { user });
    const result = await cliWrapper.executeArbitraryCommand('range', ['rdp', '--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for get_connection_info command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  try {
    logger.info('Getting connection information', { user, connectionType });

    const targetUser = user || 'current user';
    const userDirName = user || 'current-user';
    const downloadLocation = path.join(os.homedir(), '.ludus-mcp', userDirName);
    
    const connectionInfo: any = {
      user: targetUser,
      connectionType,
      rdpDownloadLocation: downloadLocation, // Directory where all files are saved
      connections: {}
    };

    // Get RDP information
    if (connectionType === 'rdp' || connectionType === 'all') {
      try {
        logger.info('Retrieving RDP connection info');
        const rdpResult = await cliWrapper.getRangeRdpInfo(user);
        
        if (rdpResult.success) {
          connectionInfo.connections.rdp = {
            available: true,
            data: rdpResult.data,
            message: 'RDP configuration files downloaded for Windows VMs',
            downloadLocation: downloadLocation,
            filePath: path.join(downloadLocation, 'rdp.zip'),
            usage: 'Extract and use the rdp.zip file with Remote Desktop clients'
          };
        } else {
          connectionInfo.connections.rdp = {
            available: false,
            message: rdpResult.message
          };
        }
      } catch (error: any) {
        connectionInfo.connections.rdp = {
          available: false,
          error: error.message
        };
      }
    }

    // Get WireGuard configuration
    if (connectionType === 'wireguard' || connectionType === 'all') {
      try {
        logger.info('Retrieving WireGuard configuration');
        const wgResult = await cliWrapper.getUserWireguardConfig(user);
        
        if (wgResult.success) {
          connectionInfo.connections.wireguard = {
            available: true,
            data: wgResult.data,
            message: 'WireGuard VPN configuration saved to wireguard.conf',
            downloadLocation: downloadLocation,
            filePath: path.join(downloadLocation, 'wireguard.conf'),
            usage: 'Import the wireguard.conf file into WireGuard client'
          };
        } else {
          connectionInfo.connections.wireguard = {
            available: false,
            message: wgResult.message
          };
        }
      } catch (error: any) {
        connectionInfo.connections.wireguard = {
          available: false,
          error: error.message
        };
      }
    }

    // Get /etc/hosts information
    if (connectionType === 'etc-hosts' || connectionType === 'all') {
      try {
        logger.info('Retrieving /etc/hosts information');
        const hostsResult = await cliWrapper.getRangeEtcHosts(user);
        
        if (hostsResult.success) {
          connectionInfo.connections.etcHosts = {
            available: true,
            data: hostsResult.data,
            message: '/etc/hosts formatted entries saved to hosts file',
            downloadLocation: downloadLocation,
            filePath: path.join(downloadLocation, 'hosts'),
            usage: 'Copy entries from the hosts file to your system hosts file'
          };
        } else {
          connectionInfo.connections.etcHosts = {
            available: false,
            message: hostsResult.message
          };
        }
      } catch (error: any) {
        connectionInfo.connections.etcHosts = {
          available: false,
          error: error.message
        };
      }
    }

    // Check if any connections were successfully retrieved
    const availableConnections = Object.values(connectionInfo.connections)
      .filter((conn: any) => conn.available).length;

    if (availableConnections === 0) {
      return {
        success: false,
        message: `No connection information available for ${targetUser}`,
        user: targetUser,
        connectionType,
        troubleshooting: [
          'Verify the user has a deployed range',
          'Check if the range is in "ready" or "running" status',
          'Ensure VMs are fully deployed before accessing connection info',
          'Try get_range_status() to check deployment progress'
        ]
      };
    }

    // Generate usage instructions based on available connections
    const usageInstructions: string[] = [];
    
    if (connectionInfo.connections.rdp?.available) {
      usageInstructions.push(`RDP zip file: ${connectionInfo.connections.rdp.filePath}`);
      usageInstructions.push('Extract and use RDP files with Remote Desktop client to connect to Windows VMs');
    }
    
    if (connectionInfo.connections.wireguard?.available) {
      usageInstructions.push(`WireGuard config file: ${connectionInfo.connections.wireguard.filePath}`);
      usageInstructions.push('Import the wireguard.conf file into WireGuard client to access the range network');
    }
    
    if (connectionInfo.connections.etcHosts?.available) {
      usageInstructions.push(`Hosts file: ${connectionInfo.connections.etcHosts.filePath}`);
      usageInstructions.push('Copy entries from hosts file to your system /etc/hosts to resolve VM hostnames');
    }

    return {
      success: true,
      message: `Connection information retrieved for ${targetUser}`,
      ...connectionInfo,
      availableConnections,
      usageInstructions,
      nextSteps: [
        'Use the connection information to access your range VMs',
        'Connect via WireGuard VPN for direct network access',
        'Use RDP files for graphical access to Windows machines',
        'Check range status if connections are not working'
      ]
    };

  } catch (error: any) {
    logger.error('Failed to get connection information', { 
      user,
      connectionType,
      error: error.message 
    });

    return {
      success: false,
      message: error.message,
      user: user || 'current user',
      connectionType,
      troubleshooting: [
        'Verify the user has a deployed range',
        'Check if you have admin permissions (if querying other users)',
        'Ensure the range is fully deployed and running',
        'Try get_range_status() to check deployment status first'
      ]
    };
  }
} 