import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { SecretDialog } from '../utils/secretDialog.js';
import { storeCredential } from '../utils/keyring.js';

export interface GetCredentialFromUserArgs {
  credName?: string;
  description?: string;
  isPassword?: boolean;
  help?: boolean;
}

export function createGetCredentialFromUserTool(logger: Logger): Tool {
  return {
    name: 'get_credential_from_user',
    description: `**MCP TOOL** (NOT a Ludus CLI command) - Prompt user to securely enter a credential via popup dialog and store in OS keyring.

IMPORTANT: This is a Ludus MCP server tool, NOT a native Ludus CLI command. Do NOT use "ludus get-credential-from-user" - that command does not exist. Use this tool directly.

PURPOSE: Securely collect and store credentials (API keys, passwords, tokens) from users via OS-native popup dialogs. Credential names must follow LudusCredName-<TargetUser>-<CredName> format for security and organization.`,
    inputSchema: {
      type: 'object',
      properties: {
        credName: {
          type: 'string',
          pattern: '^LudusCredName-.+-.+',
          description: 'Name for the credential (must start with "LudusCredName-"). Format: LudusCredName-<TargetUser>-<CredName> (e.g., "LudusCredName-MP-TailscaleKey")'
        },
        description: {
          type: 'string',
          description: 'Human-readable description of what this credential is for (shown to user in dialog)',
          default: 'Enter credential value'
        },
        isPassword: {
          type: 'boolean',
          description: 'Whether to mask input (true) or show plaintext (false)',
          default: true
        },
        help: {
          type: 'boolean',
          description: 'Show help information for the get_credential_from_user MCP tool',
          default: false
        }
      },
      required: []
    }
  };
}

export async function handleGetCredentialFromUser(
  args: GetCredentialFromUserArgs,
  logger: Logger
): Promise<any> {
  const { credName, description = 'Enter credential value', isPassword = true, help = false } = args;

  // Handle help request
  if (help) {
    logger.info('Getting help for get_credential_from_user command');
    
    return {
      success: true,
      message: 'Help information for get_credential_from_user command',
      help: true,
      content: `
get_credential_from_user - MCP TOOL (NOT Ludus CLI command)

CRITICAL DISTINCTION:
This is a Ludus MCP server tool, NOT a native Ludus CLI command!
DO NOT use "ludus get-credential-from-user" - that command does not exist.
Use this tool directly through the MCP interface.

PURPOSE:
Spawns a platform-specific secure dialog to collect sensitive information from users
and stores it in the OS credential manager for later retrieval.

USAGE:
- credName: Must follow LudusCredName-<TargetUser>-<CredName> format (e.g., "LudusCredName-MP-TailscaleKey")
- description: What the user sees in the dialog prompt
- isPassword: Whether to mask the input (default: true)

EXAMPLES (MCP tool calls):
- get_credential_from_user({ credName: "LudusCredName-MP-TailscaleKey", description: "Enter Tailscale key for MP user" })
- get_credential_from_user({ credName: "LudusCredName-Admin-APIToken", description: "Enter admin API token", isPassword: false })

SECURITY:
- Credentials stored in OS keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
- Never appear in chat logs or MCP protocol
- Only "LudusCredName-" prefixed credentials can be stored/retrieved
- Popup dialog separate from chat interface

PLATFORM SUPPORT:
- Windows: PowerShell Windows Forms dialog
- macOS: AppleScript secure input dialog  
- Linux: zenity or kdialog (requires GUI)
      `
    };
  }

  // Validate required parameters when not in help mode
  if (!credName) {
    return {
      success: false,
      message: 'Missing required parameter: credName',
      reason: 'credName is required when not requesting help. Use help: true for usage information.',
      examples: [
        'LudusCredName-MP-TailscaleKey',
        'LudusCredName-TestRange-APIToken', 
        'LudusCredName-Admin-DatabasePassword'
      ]
    };
  }

  // Validate credential name format
  if (!credName.startsWith('LudusCredName-') || !credName.match(/^LudusCredName-.+-.+$/)) {
    return {
      success: false,
      message: 'Invalid credential name format',
      credName,
      reason: 'Security restriction: credentials must follow LudusCredName-<TargetUser>-<CredName> format',
      examples: [
        'LudusCredName-MP-TailscaleKey',
        'LudusCredName-TestRange-APIToken', 
        'LudusCredName-Admin-DatabasePassword'
      ]
    };
  }

  // Check GUI availability
  if (!SecretDialog.hasGUI()) {
    return {
      success: false,
      message: 'GUI required for secure credential entry',
      credName,
      reason: 'No display detected - popup dialogs require graphical interface',
      troubleshooting: [
        'Ensure you are running on a system with GUI access',
        'For headless systems, consider using environment variables instead',
        'On Linux, ensure DISPLAY or WAYLAND_DISPLAY environment variables are set'
      ]
    };
  }

  try {
    logger.info('Prompting user for credential', { credName, isPassword });

    const secretDialog = new SecretDialog(logger);
    const result = await secretDialog.showSecretDialog({
      secretName: credName,
      description,
      isPassword,
      title: 'Ludus MCP - Enter Credential'
    });

    if (!result.success) {
      if (result.cancelled) {
        return {
          success: false,
          message: 'Credential entry cancelled by user',
          credName,
          cancelled: true
        };
      } else {
        return {
          success: false,
          message: `Dialog failed: ${result.error || 'Unknown error'}`,
          credName,
          dialogError: true,
          troubleshooting: [
            'The popup dialog may not have appeared properly',
            'Try setting environment variable LUDUS_DEBUG_DIALOG=1 for simpler dialog',
            'Ensure you have GUI access and popup dialogs are not blocked',
            'Check if PowerShell execution policy allows script execution',
            'On Windows, ensure Windows Forms are available',
            'Verify credential name follows LudusCredName-<TargetUser>-<CredName> format'
          ]
        };
      }
    }

    // Store credential in keyring
    const secret = result.secret!;
    await storeCredential(credName, secret);

    logger.info('Credential stored successfully', { credName });

    return {
      success: true,
      message: `Credential "${credName}" stored securely`,
      credName,
      description,
      stored: true,
      location: 'OS credential manager',
      nextSteps: [
        'The credential is now securely stored in the OS credential manager',
        'The credential will persist until manually deleted or system keyring is cleared',
        'You can now reference this credential name in other operations that need it'
      ]
    };

  } catch (error: any) {
    logger.error('Failed to store credential', { 
      credName,
      error: error.message 
    });

    return {
      success: false,
      message: error.message,
      credName,
              troubleshooting: [
          'Ensure the system has GUI access for popup dialogs',
          'Check credential name follows LudusCredName-<TargetUser>-<CredName> format',
          'Check if keyring/credential manager is accessible',
          'On Windows: Windows Credential Manager must be available',
          'On macOS: Keychain Access must be functional',
          'On Linux: Secret Service (libsecret) must be installed',
          'DOCUMENTATION SEARCH: If help menus don\'t provide sufficient information, use ludus_docs_search to access comprehensive official documentation with search capabilities.'
        ]
    };
  }
} 