import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { LudusCliWrapper } from '../ludus/cliWrapper.js';

export interface LudusPowerArgs {
  action: 'on' | 'off';
  user?: string;
  vmNames?: string;
  confirmDestructiveAction?: boolean;
  help?: boolean;
}

export function createLudusPowerTool(logger: Logger, cliWrapper: LudusCliWrapper): Tool {
  return {
    name: 'ludus_power',
    description: 'Power management for Ludus range VMs. Can power on or off specific VMs or all VMs in a range. Power off operations require confirmation as they may interrupt running processes.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['on', 'off'],
          description: 'Power action to perform on range VMs'
        },
        user: {
          type: 'string',
          description: 'User ID to manage power for (admin only). If omitted, manages power for current user.'
        },
        vmNames: {
          type: 'string',
          description: 'VM name(s) to power on/off. Can be a single VM name, comma-separated list, or "all" for all VMs. Defaults to "all".',
          default: 'all'
        },
        confirmDestructiveAction: {
          type: 'boolean',
          description: 'Required confirmation for power off operations. Must be true to power off VMs.',
          default: false
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the ludus power command',
          default: false
        }
      },
      required: ['action']
    }
  };
}

export async function handleLudusPower(
  args: LudusPowerArgs,
  logger: Logger,
  cliWrapper: LudusCliWrapper
): Promise<any> {
  const { action, user, vmNames = 'all', confirmDestructiveAction = false, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for ludus power command', { action, user, vmNames });
    const result = await cliWrapper.executeArbitraryCommand('power', ['--help']);
    
    if (result.success) {
      return {
        success: true,
        message: 'Help information for ludus power command',
        help: true,
        content: result.rawOutput || result.message
      };
    } else {
      throw new Error(`Failed to get help: ${result.message}`);
    }
  }

  // Safety check for power off operations
  if (action === 'off' && !confirmDestructiveAction) {
    return {
      success: false,
      message: 'Power off operation requires confirmation',
      action,
      user: user || 'current user',
      confirmationRequired: true,
      reason: 'Powering off VMs may interrupt running processes and could cause data loss',
      instructions: [
        'To confirm this action, call the tool again with confirmDestructiveAction: true',
        'Example: ludus_power({ action: "off", confirmDestructiveAction: true })',
        'This will power off all VMs in the range immediately'
      ]
    };
  }

  try {
    logger.info('Executing power management command', { action, user, vmNames });

    const targetUser = user || 'current user';
    let result;

    if (action === 'on') {
      result = await cliWrapper.powerOnRange(user, vmNames);
    } else if (action === 'off') {
      result = await cliWrapper.powerOffRange(user, vmNames);
    } else {
      throw new Error(`Invalid action: ${action}. Must be 'on' or 'off'.`);
    }

    if (result.success) {
      const actionText = action === 'on' ? 'powered on' : 'powered off';
      const statusEmoji = action === 'on' ? '🟢' : '🔴';
      const vmTarget = vmNames === 'all' ? 'All VMs' : `VM(s): ${vmNames}`;
      
      return {
        success: true,
        message: `${vmTarget} successfully ${actionText} for ${targetUser}`,
        action,
        user: targetUser,
        vmNames,
        status: actionText,
        data: result.data,
        nextSteps: action === 'on' ? [
          'VMs are starting up - this may take a few minutes',
          'Use get_range_status() to monitor VM status',
          'Use get_connection_info() once VMs are fully running'
        ] : [
          `VMs (${vmNames}) have been powered off`,
          `Use ludus_power({ action: "on", vmNames: "${vmNames}" }) to power them back on`,
          'Or use get_range_status() to check current status'
        ],
        statusIcon: statusEmoji
      };
    } else {
      throw new Error(result.message);
    }

  } catch (error: any) {
    logger.error('Power management command failed', { 
      action,
      user,
      vmNames,
      error: error.message 
    });

    return {
      success: false,
      message: error.message,
      action,
      user: user || 'current user',
      troubleshooting: [
        'Verify the user has a deployed range',
        'Check if you have admin permissions (if managing other users)',
        'Ensure the range exists and is accessible',
        'Try get_range_status() to check current range state',
        'DOCUMENTATION SEARCH: If help menus don\'t provide sufficient information, use ludus_docs_search to access comprehensive official documentation with search capabilities.'
      ]
    };
  }
} 