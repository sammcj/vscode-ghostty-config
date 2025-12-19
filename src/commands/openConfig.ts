import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface ConfigLocation {
  path: string;
  label: string;
  exists: boolean;
}

function getConfigLocations(): ConfigLocation[] {
  const homeDir = os.homedir();
  const locations: ConfigLocation[] = [];

  // XDG location (works on all platforms)
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  const xdgPath = path.join(xdgConfigHome, 'ghostty', 'config');
  locations.push({
    path: xdgPath,
    label: `XDG: ${xdgPath}`,
    exists: fs.existsSync(xdgPath),
  });

  // macOS-specific location
  if (process.platform === 'darwin') {
    const macosPath = path.join(
      homeDir,
      'Library',
      'Application Support',
      'com.mitchellh.ghostty',
      'config'
    );
    locations.push({
      path: macosPath,
      label: `macOS: ${macosPath}`,
      exists: fs.existsSync(macosPath),
    });
  }

  return locations;
}

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createDefaultConfig(filePath: string): void {
  const defaultContent = `# Ghostty Configuration
# See https://ghostty.org/docs/config/reference for all options

# Font settings
# font-family = "JetBrains Mono"
# font-size = 14

# Theme
# theme = auto

# Window settings
# window-padding-x = 10
# window-padding-y = 10

# Keybindings
# keybind = ctrl+shift+c=copy_to_clipboard
# keybind = ctrl+shift+v=paste_from_clipboard
`;
  ensureDirectoryExists(filePath);
  fs.writeFileSync(filePath, defaultContent, 'utf8');
}

export function registerOpenConfigCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('ghostty-config.openConfig', async () => {
    const locations = getConfigLocations();
    const existingLocations = locations.filter((loc) => loc.exists);

    let selectedPath: string;

    if (existingLocations.length === 0) {
      // No config exists - ask where to create one
      const preferredLocation = locations[0]; // XDG is preferred
      const create = await vscode.window.showInformationMessage(
        `No Ghostty config found. Create one at ${preferredLocation.path}?`,
        'Create',
        'Choose Location',
        'Cancel'
      );

      if (create === 'Create') {
        createDefaultConfig(preferredLocation.path);
        selectedPath = preferredLocation.path;
      } else if (create === 'Choose Location') {
        const choice = await vscode.window.showQuickPick(
          locations.map((loc) => ({
            label: loc.label,
            path: loc.path,
          })),
          { placeHolder: 'Select where to create the config file' }
        );

        if (!choice) {
          return;
        }

        createDefaultConfig(choice.path);
        selectedPath = choice.path;
      } else {
        return;
      }
    } else if (existingLocations.length === 1) {
      // One config exists - open it
      selectedPath = existingLocations[0].path;
    } else {
      // Multiple configs exist - let user choose
      const choice = await vscode.window.showQuickPick(
        existingLocations.map((loc) => ({
          label: loc.label,
          path: loc.path,
        })),
        { placeHolder: 'Multiple config files found. Select one to open' }
      );

      if (!choice) {
        return;
      }

      selectedPath = choice.path;
    }

    // Open the config file
    const document = await vscode.workspace.openTextDocument(selectedPath);
    await vscode.window.showTextDocument(document);
  });
}
