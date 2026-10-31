import mappingsJson from './processTypeMappings.json';

// Add mappings in processTypeMappings.json. Exact matches take precedence.
const moduleProcessTypes: Readonly<Record<string, string>> = mappingsJson;

export function getProcessTypeFromModule(moduleName: string): string | null {
  if (!moduleName) return null;
  if (moduleProcessTypes[moduleName]) return moduleProcessTypes[moduleName];

  for (const [className, processType] of Object.entries(moduleProcessTypes)) {
    if (moduleName.includes(className)) return processType;
  }
  return null;
}

/** Example: MainView[1234].swift becomes MainView[UI].swift. */
export function replaceProcessIdWithType(sourceName: string, moduleName: string): string {
  if (!sourceName || !moduleName) return sourceName;
  const processType = getProcessTypeFromModule(moduleName);
  return processType ? sourceName.replace(/\[\d+\]/, `[${processType}]`) : sourceName;
}
