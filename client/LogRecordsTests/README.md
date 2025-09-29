# Log Records Test Files

This folder contains comprehensive test log files for each supported platform, extracted from real log samples found in the `SupportedLog` folder.

## File Structure

### `mac_test_logs.log`
- **Source**: `SupportedLog/MAC/*/app_log.txt`, `daemon_log.txt`
- **Formats**:
  - Standard Mac app format: `YYYY-MM-DD HH:MM:SS:SSS [Module:Line] [Thread] [Process] Message`
  - Mac daemon format: `YYYY-MM-DD HH:MM:SS:SSS [Module:Line] [Process] [Thread] Message`
  - Mac system logs with cato-ios_logger prefix
- **Key Features**: Complex module names, authentication flows, network information, state changes

### `windows_test_logs.log`
- **Source**: `SupportedLog/Win/*/cato_dem.log`, `browser.log`
- **Formats**:
  - Standard Windows format: `[MM/DD/YY HH:MM:SS.SSS] [Level] [Module] [ProcessID] [ThreadID] [File:Line] Message`
  - Chrome/Windows format: `[ProcessID:ThreadID:MMDD/HHMMSS.SSS:LEVEL:file.cc(line)] [Optional timestamp] Message`
  - Hexadecimal process/thread IDs: `[150C:2878]`
- **Key Features**: Multiple date formats, hex and decimal IDs, browser logs, system errors

### `android_test_logs.log`
- **Source**: `SupportedLog/Android/android-vpn-catonetworks-*.log`, `log_*.log`
- **Formats**:
  - Android app format: `[YYYY-MMM-DD HH:MM:SS.SSS] [Thread] [Module] - [Level] - Message`
  - Android system format: `MM-DD HH:MM:SS.SSS PID TID Level Tag: Message`
- **Key Features**: Activity lifecycle, service logs, threading, system logs, crash logs

### `linux_test_logs.log`
- **Source**: `SupportedLog/linux-cato-clientd.log`
- **Formats**:
  - Linux format: `YYYY-MM-DD HH:MM:SS [Level][Module][Function:Line][Field1][Field2][Thread] Message`
- **Key Features**: Signal handling, SSL/TLS, telemetry, configuration, module logging

## Test Coverage

Each file contains diverse log samples covering:
- ✅ Different log levels (Debug, Info, Warning, Error, Fatal)
- ✅ Various module/component names
- ✅ Process and thread identification
- ✅ Timestamp variations
- ✅ Network and authentication logs
- ✅ Error handling and state management
- ✅ System-specific features

## Usage

These files can be used to:
1. **Test log parsing functions** - Verify that all format variations are correctly parsed
2. **Validate log cleaning** - Ensure metadata is properly removed from display
3. **Debug display issues** - Reproduce specific formatting problems
4. **Performance testing** - Load test with realistic log content
5. **Format detection** - Test automatic platform detection

## Original Sources

All samples were extracted from real production logs found in:
- `SupportedLog/MAC/` - macOS application and daemon logs
- `SupportedLog/Win/` - Windows application and browser logs  
- `SupportedLog/Android/` - Android application and system logs
- `SupportedLog/linux-cato-clientd.log` - Linux client daemon logs

## Notes

- Log content has been sanitized for privacy (no real user data or credentials)
- File paths and line numbers preserved for parsing accuracy
- Comments added for clarity and format identification
- Each platform file is self-contained and can be tested independently