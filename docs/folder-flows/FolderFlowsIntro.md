# ZettelFlow Plugin Documentation

## Introduction to Folder-Level Automated Flows

### Overview

The ZettelFlow plugin supports a powerful feature: **Folder-Level Automated Flows**. This feature allows you to assign specific workflows to individual folders. Whenever a file is created in one of these configured folders, an automatic modal will trigger, guiding you through the workflow you have set up for that folder.

### Key Benefits

- **Automation**: Streamline your note-taking process by automating repetitive tasks.
- **Consistency**: Ensure that all files created in a specific folder follow the same process, enhancing organization and standardization.
- **Ease of Use**: Activate workflows without needing to manually trigger them, improving efficiency and user experience.

### How It Works

1. **Assigning a Workflow to a Folder**:
   - Right-click on the folder you want to assign a workflow to.
   - Select the option to configure the workflow for that folder.
   - This action will create a canvas file in a configurable path (default: `_ZettelFlow`).
   - The filename will be the path of the folder with slashes (`/`) replaced by underscores (`_`).

2. **Configuration File**:
   - The created canvas file will store the workflow configuration for the folder.
   - You can adjust the configuration by editing this canvas file as needed.

3. **Automatic Modal Activation**:
   - Whenever a new file is created in a folder that has an assigned configuration, the associated workflow modal will automatically appear.
   - This ensures that every file created in this folder follows the specified workflow, regardless of the creation method (e.g., directly in Obsidian, through a synced service, etc.).

### Example Use Case

Consider you have a folder named `Profiles`. You can configure a workflow for this folder to collect essential information such as email, team, and name whenever a new profile document is created. 

#### Steps to Configure:

1. **Open ZettelFlow Settings**:
   - Go to the ZettelFlow plugin settings in Obsidian.

2. **Assign Workflow**:
   - Select the `Profiles` folder.
   - Assign the desired workflow (e.g., Profile Creation Workflow).

3. **Create a File**:
   - Create a new file in the `Profiles` folder.
   - Watch as the Profile Creation Workflow modal appears, prompting you to fill out the necessary details like email, team, and name.

### Example Use Case

Consider you have a folder named `Profiles`. You can configure a workflow for this folder to collect essential information such as email, team, and name whenever a new profile document is created.

#### Steps to Configure:

1. **Open ZettelFlow Settings**:
   - Go to the ZettelFlow plugin settings in Obsidian.

2. **Assign Workflow**:
   - Right-click on the `Profiles` folder.
   - Select the configuration option to assign the Profile Creation Workflow.
   - This will create a file named `_ZettelFlow/Profiles.canvas`.

3. **Create a File**:
   - Create a new file in the `Profiles` folder.
   - Watch as the Profile Creation Workflow modal appears, prompting you to fill out the necessary details like email, team, and name.

### Configuration Details

To set up Folder-Level Automated Flows, follow these detailed steps:

1. **Access Plugin Settings**:
   - Go to `Settings` > `Community Plugins` > `ZettelFlow`.

2. **Select Folder**:
   - Right-click on the folder you want to configure and choose the option to configure the workflow.

3. **Assign Workflow**:
   - The system will create a configuration file in the default path (`_ZettelFlow`) with the folder's path name.
   - Adjust the workflow configuration in this file as needed.

4. **Save Settings**:
   - Ensure you save your settings to apply the changes.

### Troubleshooting

- **Modal Not Appearing**: Ensure that the folder is correctly configured in the ZettelFlow settings and the configuration file exists in the `_ZettelFlow` directory (or the custom path you have set).
- **Workflow Not Triggering**: Check if the workflow is active and correctly assigned to the folder by reviewing the canvas file.

> If the note was create with the Ribbon button inside one of the folders with a workflow, the modal will not appear. This is a expected behavior to avoid the modal to appear twice for the same note.
