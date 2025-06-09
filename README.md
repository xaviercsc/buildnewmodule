IBM i Module Builder - VS Code Extension
This Visual Studio Code extension allows users to define and manage SSH connection profiles for IBM i systems, retrieve parameters from a JSON file on the remote system, and build modules by executing parameterized IBM i commands via SSH.

✨ Features
Create, update, and delete SSH connection profiles

Store profiles locally in sshProfiles.json

Secure password entry for each session

Read remote JSON (e.g., devJSON.json) to extract parameters

Replace placeholders in a user-defined command (&1, &2, &3)

Execute IBM i system -i commands over SSH

Output displayed in both the VS Code output channel and terminal

📦 Installation
Clone this repo or download the .vsix if available.

Run vsce package to generate the extension file if you are working locally.

In VS Code, go to Extensions > ... > Install from VSIX.

Select the .vsix file.

⚙️ Usage
Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) and run Build New Module.

Select or create an SSH profile.

Enter the password for the profile.

Enter the IBM i command with placeholders (e.g., CRTDTAARA DTAARA(&1/&2) TYPE(*CHAR) VALUE('&3')).

The extension will:

Connect to the remote system

Read /home/XMJSCPTC/src/devJSON.json

Replace &1, &2, and &3 with values library, dtaara, and value respectively

Execute the resolved command via system -i

Output will be logged to:

The IBM i SSH Output channel

A new terminal tab named IBM i Command Log

🗂 JSON Format
Ensure that the JSON file on the remote system (/home/XMJSCPTC/src/devJSON.json) has the following structure:

json
Copy
Edit
{
  "library": "MYLIB",
  "dtaara": "MYDATA",
  "value": "12345"
}
🔐 Security Note
Passwords are entered per session and not stored.

Connection profiles are stored locally in JSON format.

🧪 Development
Built using TypeScript and the VS Code Extension API

Uses ssh2 for SSH connections

Stores profile data using the extension's globalStorageUri

📁 Project Structure
pgsql
Copy
Edit
extension/
├── src/
│   └── extension.ts  # Main logic
├── package.json       # Extension manifest
├── tsconfig.json
└── README.md          # You're here
🚀 Example Command Flow
JSON file fetched:

json
Copy
Edit
{ "library": "PRODLIB", "dtaara": "CFGDATA", "value": "ON" }
User input command:

scss
Copy
Edit
CRTDTAARA DTAARA(&1/&2) TYPE(*CHAR) VALUE('&3')
Resolved command:

scss
Copy
Edit
system -i "CRTDTAARA DTAARA(PRODLIB/CFGDATA) TYPE(*CHAR) VALUE('ON')"
🧹 Cleanup
To remove saved profiles, delete the sshProfiles.json file located under the extension’s global storage directory. You can also use the "Delete Profile" option in the command flow.

🛠 Dependencies
vscode

ssh2

Node.js and TypeScript

🙋 Support
For issues or feature requests, feel free to open an issue on the repository.

Let me know if you'd like a package.json and tsconfig.json setup added as well.