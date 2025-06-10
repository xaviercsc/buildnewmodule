import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Client, ConnectConfig } from 'ssh2';

interface ConnectionProfile {
  name: string;
  host: string;
  port: number;
  username: string;
}

export function activate(context: vscode.ExtensionContext) {
  const profilesFile = path.join(context.globalStorageUri.fsPath, 'sshProfiles.json');

  if (!fs.existsSync(context.globalStorageUri.fsPath)) {
    fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
  }

  function loadProfiles(): ConnectionProfile[] {
    try {
      if (fs.existsSync(profilesFile)) {
        const raw = fs.readFileSync(profilesFile, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        vscode.window.showErrorMessage('Failed to load connection profiles: ' + e.message);
      } else {
        vscode.window.showErrorMessage('Failed to load connection profiles');
      }
    }
    return [];
  }

  function saveProfiles(profiles: ConnectionProfile[]) {
    try {
      fs.writeFileSync(profilesFile, JSON.stringify(profiles, null, 2));
    } catch (e: unknown) {
      if (e instanceof Error) {
        vscode.window.showErrorMessage('Failed to save connection profiles: ' + e.message);
      } else {
        vscode.window.showErrorMessage('Failed to save connection profiles');
      }
    }
  }

  async function addOrUpdateProfile(profiles: ConnectionProfile[]): Promise<ConnectionProfile | undefined> {
    const options = ['Add New Connection', ...profiles.map(p => p.name)];
    const pick = await vscode.window.showQuickPick(options, { placeHolder: 'Select or add connection profile' });
    if (!pick) return;

    if (pick === 'Add New Connection') {
      const name = await vscode.window.showInputBox({ prompt: 'Profile Name (unique)', ignoreFocusOut: true });
      if (!name) return;

      const host = await vscode.window.showInputBox({ prompt: 'IBM i host or DNS address', ignoreFocusOut: true });
      if (!host) return;

      const portInput = await vscode.window.showInputBox({
        prompt: 'SSH port (default: 22)',
        value: '22',
        ignoreFocusOut: true,
        validateInput: value =>
          isNaN(Number(value)) || Number(value) <= 0 || !Number.isInteger(Number(value))
            ? 'Enter a valid port number'
            : null,
      });
      if (!portInput) return;
      const port = Number(portInput);

      const username = await vscode.window.showInputBox({ prompt: 'Username', ignoreFocusOut: true });
      if (!username) return;

      const newProfile: ConnectionProfile = { name, host, port, username };
      profiles.push(newProfile);
      saveProfiles(profiles);
      return newProfile;
    } else {
      const existing = profiles.find(p => p.name === pick);
      if (!existing) return;

      const updateFields = await vscode.window.showQuickPick(
        ['Use existing profile as is', 'Update profile details', 'Delete profile'],
        { placeHolder: `Choose what to do with profile '${existing.name}'` }
      );
      if (!updateFields) return;

      if (updateFields === 'Delete profile') {
        const confirm = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Confirm delete '${existing.name}'?` });
        if (confirm === 'Yes') {
          const idx = profiles.findIndex(p => p.name === existing.name);
          if (idx >= 0) {
            profiles.splice(idx, 1);
            saveProfiles(profiles);
            vscode.window.showInformationMessage(`Deleted profile '${existing.name}'.`);
          }
          return;
        }
        return;
      }

      if (updateFields === 'Use existing profile as is') {
        return existing;
      }

      const host = await vscode.window.showInputBox({
        prompt: `IBM i host or DNS address (current: ${existing.host})`,
        ignoreFocusOut: true,
        value: existing.host,
      });
      if (!host) return;

      const portInput = await vscode.window.showInputBox({
        prompt: `SSH port (current: ${existing.port})`,
        value: existing.port.toString(),
        ignoreFocusOut: true,
        validateInput: value =>
          isNaN(Number(value)) || Number(value) <= 0 || !Number.isInteger(Number(value))
            ? 'Enter a valid port number'
            : null,
      });
      if (!portInput) return;
      const port = Number(portInput);

      const username = await vscode.window.showInputBox({
        prompt: `Username (current: ${existing.username})`,
        ignoreFocusOut: true,
        value: existing.username,
      });
      if (!username) return;

      existing.host = host;
      existing.port = port;
      existing.username = username;
      saveProfiles(profiles);
      return existing;
    }
  }

  const disposable = vscode.commands.registerCommand('buildmodule.buildNewModule', async () => {
    try {
      const profiles = loadProfiles();
      const profile = await addOrUpdateProfile(profiles);
      if (!profile) {
        vscode.window.showInformationMessage('No connection profile selected.');
        return;
      }

      const password = await vscode.window.showInputBox({
        prompt: `Enter password for ${profile.username}@${profile.host}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (!password) return;

      const rawCommand = await vscode.window.showInputBox({
        prompt: 'Enter command with placeholders (&1, &2, &3)',
        placeHolder: 'e.g. CRTDTAARA DTAARA(&1/&2) TYPE(*CHAR) VALUE(\'&3\')',
        ignoreFocusOut: true,
      });
      if (!rawCommand) return;

      const conn = new Client();
      const outputChannel = vscode.window.createOutputChannel('IBM i SSH Output');
      const terminal = vscode.window.createTerminal({ name: 'IBM i Command Log' });
      outputChannel.clear();
      outputChannel.show(true);
      terminal.show();

      conn.on('ready', () => {
        vscode.window.showInformationMessage(`Connected to ${profile.host} as ${profile.username}`);

        const remoteJsonPath = './src/devEnv.json';
        conn.exec(`cat ${remoteJsonPath}`, (err, stream) => {
          if (err) {
            vscode.window.showErrorMessage('Error reading remote JSON file: ' + err.message);
            conn.end();
            return;
          }

          let jsonDataStr = '';
          let jsonErrorOccurred = false;

          stream
            .on('data', (data: Buffer) => {
              jsonDataStr += data.toString();
            })
            .on('close', () => {
              if (jsonErrorOccurred) {
                conn.end();
                return;
              }

              try {
                const jsonData = JSON.parse(jsonDataStr);
                const { library, dtaara, value } = jsonData;

                const resolvedCommand = rawCommand
                  .replace(/&1/g, library)
                  .replace(/&2/g, dtaara)
                  .replace(/&3/g, value);

                const ibmiCommand = `system -i "${resolvedCommand}"`;

                outputChannel.appendLine(`Executing: ${ibmiCommand}`);
                terminal.sendText(ibmiCommand, true);

                conn.exec(ibmiCommand, (err, cmdStream) => {
                  if (err) {
                    vscode.window.showErrorMessage('SSH exec error: ' + err.message);
                    conn.end();
                    return;
                  }

                  cmdStream
                    .on('data', (data: Buffer) => {
                      const output = data.toString();
                      outputChannel.append(output);
                      terminal.sendText(output, true);
                    })
                    .on('close', (code: number, signal: string | null) => {
                      const footer = `\nCommand finished with code ${code} and signal ${signal}`;
                      outputChannel.appendLine(footer);
                      terminal.sendText(footer, true);
                      vscode.window.showInformationMessage(`IBM i command completed. Exit code: ${code}`);
                      conn.end();
                    });

                  cmdStream.stderr?.on('data', (data: Buffer) => {
                    const errMsg = 'STDERR: ' + data.toString();
                    outputChannel.appendLine(errMsg);
                    terminal.sendText(errMsg, true);
                    vscode.window.showErrorMessage(errMsg);
                  });
                });
              } catch (e: unknown) {
                if (e instanceof Error) {
                  vscode.window.showErrorMessage('Invalid JSON data: ' + e.message);
                } else {
                  vscode.window.showErrorMessage('Invalid JSON data');
                }
                conn.end();
              }
            });

          stream.stderr?.on('data', (data: Buffer) => {
            vscode.window.showErrorMessage('Error reading JSON file: ' + data.toString());
            jsonErrorOccurred = true;
          });
        });
      });

      conn.on('error', (err: Error) => {
        vscode.window.showErrorMessage(`SSH connection error: ${err.message}`);
      });

      const config: ConnectConfig = {
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password
      };
      conn.connect(config);

    } catch (err: unknown) {
      if (err instanceof Error) {
        vscode.window.showErrorMessage('Unexpected error: ' + err.message);
      } else {
        vscode.window.showErrorMessage('Unexpected error occurred.');
      }
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
