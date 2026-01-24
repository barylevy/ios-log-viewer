export const AI_CONTEXT_MESSAGE = `Hi! I'm working on a VPN application and a VPN extension.

**Context:**
- I have a main VPN application running on the device
- I have a VPN extension/plugin that interfaces with the application
- Both the application and extension generate detailed logs of their activity
- I'm using this tool (Log Viewer) to analyze the logs

**What I'm looking for:**
- Identifying issues and crashes in the application and extension
- Analyzing abnormal VPN connection behavior
- Identifying error patterns
- Understanding the sequence of events that leads to problems

**Log structure:**
The logs contain:
- Precise timestamps
- Severity levels (Debug, Info, Warning, Error)
- Information about threads and processes
- Detailed error messages
- Connectivity and network state information

Please help me analyze the logs and find issues. If you see suspicious patterns, errors, or unusual behavior - point them out.`;
