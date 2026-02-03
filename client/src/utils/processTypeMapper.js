/**
 * Maps module/class names to process types
 */

// Process type constants
export const PROCESS_TYPES = {
  UI: 'UI',
  EXTENSION: 'Extn',
  DAEMON: 'Daemon',
  USER_AGENT: 'UsrAgnt'
};

// Mapping from module/class name to process type
const MODULE_TO_PROCESS_TYPE = {
  'MainView': PROCESS_TYPES.UI,
  'CNSharedManager+macOS': PROCESS_TYPES.UI,
  'CNSharedManager+iOS': PROCESS_TYPES.UI,
  'PacketTunnelProvider': PROCESS_TYPES.EXTENSION,
  'UsersMonitor': PROCESS_TYPES.USER_AGENT,
  'NetworkInterfaceMonitor': PROCESS_TYPES.USER_AGENT,
  'DaemonCommands': PROCESS_TYPES.DAEMON,
  'DevicePostureCustomChecks': PROCESS_TYPES.DAEMON
};

/**
 * Get process type from module name
 * @param {string} moduleName - The module/class name from the log
 * @returns {string|null} - The process type or null if not found
 */
export const getProcessTypeFromModule = (moduleName) => {
  if (!moduleName) return null;
  
  // Direct match
  if (MODULE_TO_PROCESS_TYPE[moduleName]) {
    return MODULE_TO_PROCESS_TYPE[moduleName];
  }
  
  // Check if module name contains any of the mapped class names
  for (const [className, processType] of Object.entries(MODULE_TO_PROCESS_TYPE)) {
    if (moduleName.includes(className)) {
      return processType;
    }
  }
  
  return null;
};

/**
 * Add a new module to process type mapping
 * This allows easy extension of the mapping
 * @param {string} moduleName - The module/class name
 * @param {string} processType - The process type (use PROCESS_TYPES constants)
 */
export const addModuleMapping = (moduleName, processType) => {
  MODULE_TO_PROCESS_TYPE[moduleName] = processType;
};

/**
 * Get all current mappings
 * @returns {Object} - Copy of current mappings
 */
export const getAllMappings = () => {
  return { ...MODULE_TO_PROCESS_TYPE };
};

/**
 * Replace process ID in source file name with process type
 * Example: "MainView[1234].swift" -> "MainView[UI].swift"
 * @param {string} sourceName - The source file name with process ID
 * @param {string} moduleName - The module/class name from the log
 * @returns {string} - Source name with process type instead of ID
 */
export const replaceProcessIdWithType = (sourceName, moduleName) => {
  if (!sourceName || !moduleName) return sourceName;
  
  const processType = getProcessTypeFromModule(moduleName);
  if (!processType) return sourceName;
  
  // Pattern to match process ID in brackets, e.g., [1234]
  // Handles various formats: [123], [12345], etc.
  const processIdPattern = /\[\d+\]/;
  
  if (processIdPattern.test(sourceName)) {
    return sourceName.replace(processIdPattern, `[${processType}]`);
  }
  
  return sourceName;
};
