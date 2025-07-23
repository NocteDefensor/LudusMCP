import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger.js';

export interface SecretDialogOptions {
  secretName: string;
  description: string;
  isPassword?: boolean;
  title?: string;
}

export interface SecretDialogResult {
  success: boolean;
  secret?: string;
  cancelled?: boolean;
  error?: string;
}

export class SecretDialog {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Show platform-specific secret input dialog
   */
  async showSecretDialog(options: SecretDialogOptions): Promise<SecretDialogResult> {
    const { secretName, description, isPassword = true, title = 'Enter Secret' } = options;
    
    this.logger.info('Showing secret dialog', { 
      secretName, 
      platform: process.platform,
      isPassword 
    });

    try {
      const platform = process.platform;
      
      if (platform === 'win32') {
        return await this.showWindowsDialog(title, description, isPassword);
      } else if (platform === 'darwin') {
        return await this.showMacDialog(title, description, isPassword);
      } else {
        return await this.showLinuxDialog(title, description, isPassword);
      }
    } catch (error: any) {
      this.logger.error('Failed to show secret dialog', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Windows PowerShell dialog using Windows Forms
   */
  private async showWindowsDialog(title: string, description: string, isPassword: boolean): Promise<SecretDialogResult> {
    const passwordChar = isPassword ? '$textBox.UseSystemPasswordChar = $true' : '';
    
    // Escape strings for PowerShell
    const escapedTitle = title.replace(/'/g, "''");
    const escapedDescription = description.replace(/'/g, "''");
    
    // Try simpler approach first for debugging
    if (process.env.LUDUS_DEBUG_DIALOG) {
      return this.showSimpleWindowsDialog(escapedTitle, escapedDescription, isPassword);
    }
    
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = '${escapedTitle}'
$form.Size = New-Object System.Drawing.Size(400, 200)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
[void]($form.MaximizeBox = $false)
[void]($form.MinimizeBox = $false)  
[void]($form.TopMost = $true)

$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(10, 20)
$label.Size = New-Object System.Drawing.Size(370, 40)
$label.Text = '${escapedDescription}'
[void]$form.Controls.Add($label)

$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Location = New-Object System.Drawing.Point(10, 70)
$textBox.Size = New-Object System.Drawing.Size(360, 20)
${passwordChar}
[void]$form.Controls.Add($textBox)

$okButton = New-Object System.Windows.Forms.Button
$okButton.Location = New-Object System.Drawing.Point(225, 120)
$okButton.Size = New-Object System.Drawing.Size(75, 23)
$okButton.Text = "OK"
$okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $okButton
[void]$form.Controls.Add($okButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Location = New-Object System.Drawing.Point(310, 120)
$cancelButton.Size = New-Object System.Drawing.Size(75, 23)
$cancelButton.Text = "Cancel"
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancelButton
[void]$form.Controls.Add($cancelButton)

[void]$textBox.Focus()
$result = $form.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $textBox.Text
} else {
    Write-Output "__CANCELLED__"
}

$form.Dispose()
    `;

    try {
      // Use temporary file approach to avoid quote escaping issues
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `ludus-dialog-${Date.now()}.ps1`);
      
      fs.writeFileSync(tempFile, psScript, 'utf8');
      
      const output = execSync(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`, {
        encoding: 'utf8',
        timeout: 120000
      }).trim();

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (output === '__CANCELLED__') {
        return { success: false, cancelled: true };
      }

      if (!output || output.length === 0) {
        return { success: false, error: 'No input received from dialog' };
      }

      return { success: true, secret: output };
    } catch (error: any) {
      if (error.signal === 'SIGTERM') {
        return { success: false, cancelled: true };
      }
      throw error;
    }
  }

  /**
   * Simple Windows dialog for debugging
   */
  private async showSimpleWindowsDialog(title: string, description: string, isPassword: boolean): Promise<SecretDialogResult> {
    const passwordFlag = isPassword ? ' -AsSecureString' : '';
    const simpleScript = `
$credential = Read-Host -Prompt '${description}'${passwordFlag}
if ($credential) {
    if ($credential.GetType().Name -eq 'SecureString') {
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential)
        $PlainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        Write-Output $PlainPassword
    } else {
        Write-Output $credential
    }
} else {
    Write-Output "__CANCELLED__"
}
    `;

    try {
      const output = execSync(`powershell -ExecutionPolicy Bypass -Command "${simpleScript.replace(/"/g, '""')}"`, {
        encoding: 'utf8',
        timeout: 120000
      }).trim();

      if (output === '__CANCELLED__' || !output) {
        return { success: false, cancelled: true };
      }

      return { success: true, secret: output };
    } catch (error: any) {
      if (error.signal === 'SIGTERM') {
        return { success: false, cancelled: true };
      }
      throw error;
    }
  }

  /**
   * macOS AppleScript dialog
   */
  private async showMacDialog(title: string, description: string, isPassword: boolean): Promise<SecretDialogResult> {
    const dialogType = isPassword ? 'with hidden answer' : '';
    
    const script = `osascript -e 'display dialog "${description}" default answer "" ${dialogType} with title "${title}" buttons {"Cancel", "OK"} default button "OK"' 2>/dev/null || echo "__CANCELLED__"`;

    try {
      const output = execSync(script, {
        encoding: 'utf8',
        timeout: 120000
      }).trim();

      if (output === '__CANCELLED__' || output.includes('User canceled')) {
        return { success: false, cancelled: true };
      }

      // AppleScript output format: "button returned:OK, text returned:SECRET"
      const match = output.match(/text returned:(.*)$/);
      if (match) {
        return { success: true, secret: match[1] };
      }

      throw new Error('Failed to parse AppleScript output');
    } catch (error: any) {
      if (error.status === 1) {
        return { success: false, cancelled: true };
      }
      throw error;
    }
  }

  /**
   * Linux dialog using zenity or kdialog
   */
  private async showLinuxDialog(title: string, description: string, isPassword: boolean): Promise<SecretDialogResult> {
    // Try zenity first
    if (this.hasCommand('zenity')) {
      return this.showZenityDialog(title, description, isPassword);
    }
    
    // Fallback to kdialog
    if (this.hasCommand('kdialog')) {
      return this.showKDialogDialog(title, description, isPassword);
    }

    throw new Error('No GUI dialog tool available (zenity or kdialog required on Linux)');
  }

  private async showZenityDialog(title: string, description: string, isPassword: boolean): Promise<SecretDialogResult> {
    const entryType = isPassword ? '--password' : '--entry';
    const command = `zenity ${entryType} --title="${title}" --text="${description}" --width=400`;

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 120000
      }).trim();

      return { success: true, secret: output };
    } catch (error: any) {
      if (error.status === 1) {
        return { success: false, cancelled: true };
      }
      throw error;
    }
  }

  private async showKDialogDialog(title: string, description: string, isPassword: boolean): Promise<SecretDialogResult> {
    const dialogType = isPassword ? '--password' : '--inputbox';
    const command = `kdialog ${dialogType} "${description}" --title "${title}"`;

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 120000
      }).trim();

      return { success: true, secret: output };
    } catch (error: any) {
      if (error.status === 1) {
        return { success: false, cancelled: true };
      }
      throw error;
    }
  }

  /**
   * Check if a command is available
   */
  private hasCommand(command: string): boolean {
    try {
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if GUI is available on the current system
   */
  static hasGUI(): boolean {
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows almost always has GUI available
      return true;
    } else if (platform === 'darwin') {
      // macOS always has GUI available
      return true;
    } else {
      // Linux - check for display
      return !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
    }
  }
} 