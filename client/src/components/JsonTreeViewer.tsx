import type { ChangeEvent, ReactNode } from 'react';
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
interface Props {
  data: JsonValue | undefined;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
}
import React, { useState, useMemo } from 'react';

const JsonTreeViewer = ({ data, searchTerm = '', onSearchChange }: Props) => {
  const [searchQuery, setSearchQuery] = useState(searchTerm);
  const [expandedPaths, setExpandedPaths] = useState(new Set(['root'])); // Start with root expanded
  const [isAllExpanded, setIsAllExpanded] = useState(false); // Track expand/collapse state

  // Parse JSON if it's a string
  const parsedData = useMemo<JsonValue | null>(() => {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return null; // Not valid JSON
      }
    }
    return typeof data === 'object' ? data : null;
  }, [data]);

  // Check if data is JSON-like
  const isValidJson = parsedData !== null && typeof parsedData === 'object';

  // Handle search
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
  };

  // Toggle node expansion
  const toggleExpansion = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Expand all nodes
  const expandAll = () => {
    const allPaths = new Set<string>();
    const collectPaths = (obj: JsonValue, path = 'root', depth = 0): void => {
      if (depth > 32 || allPaths.size >= 10000) return;
      allPaths.add(path);
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          const newPath = `${path}[${index}]`;
          collectPaths(item, newPath, depth + 1);
        });
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach((key) => {
          const newPath = `${path}.${key}`;
          collectPaths(obj[key], newPath, depth + 1);
        });
      }
    };
    collectPaths(parsedData);
    setExpandedPaths(allPaths);
    setIsAllExpanded(true);
  };

  // Collapse all nodes
  const collapseAll = () => {
    setExpandedPaths(new Set(['root']));
    setIsAllExpanded(false);
  };

  // Toggle expand/collapse all
  const toggleExpandCollapse = () => {
    if (isAllExpanded) {
      collapseAll();
    } else {
      expandAll();
    }
  };

  // Check if text matches search
  const matchesSearch = (text: string) => {
    if (!searchQuery) return false;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  // If not valid JSON, show as plain text
  if (!isValidJson) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border">
        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900 dark:text-white">
          {typeof data === 'string' ? data : JSON.stringify(data)}
        </pre>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-gray-600">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleExpandCollapse}
            className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
          >
            {isAllExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>

        <div className="flex-1 max-w-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search in JSON..."
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* JSON Tree */}
      <div className="font-mono text-xs max-h-96 overflow-auto">
        <JsonNode
          data={parsedData}
          path="root"
          level={0}
          expandedPaths={expandedPaths}
          onToggle={toggleExpansion}
          searchQuery={searchQuery}
          matchesSearch={matchesSearch}
        />
      </div>
    </div>
  );
};

interface NodeProps {
  data: JsonValue;
  path: string;
  level: number;
  expandedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
  searchQuery: string;
  matchesSearch: (text: string) => boolean;
}
const JsonNode = ({ data, path, level, expandedPaths, onToggle, matchesSearch }: NodeProps) => {
  const indent = level * 16;

  const renderValue = (value: JsonValue, currentPath = path, depth = 0): ReactNode => {
    if (depth > 32) return <span>Maximum display depth reached.</span>;
    if (value === null) {
      return <span className="text-gray-500 dark:text-gray-400">null</span>;
    }

    if (typeof value === 'boolean') {
      const text = value.toString();
      const isHighlighted = matchesSearch(text);
      return (
        <span
          className={`text-purple-600 dark:text-purple-400 ${isHighlighted ? 'bg-yellow-200 dark:bg-yellow-800' : ''}`}
        >
          {text}
        </span>
      );
    }

    if (typeof value === 'number') {
      const text = value.toString();
      const isHighlighted = matchesSearch(text);
      return (
        <span
          className={`text-blue-600 dark:text-blue-400 ${isHighlighted ? 'bg-yellow-200 dark:bg-yellow-800' : ''}`}
        >
          {text}
        </span>
      );
    }

    if (typeof value === 'string') {
      const isHighlighted = matchesSearch(value);
      return (
        <span
          className={`text-green-600 dark:text-green-400 ${isHighlighted ? 'bg-yellow-200 dark:bg-yellow-800' : ''}`}
        >
          "{value}"
        </span>
      );
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-gray-600 dark:text-gray-400">[]</span>;
      }

      const isCurrentExpanded = expandedPaths.has(currentPath);

      return (
        <div>
          <button
            onClick={() => onToggle(currentPath)}
            className="flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200"
          >
            <span
              className={`transform transition-transform text-xs ${isCurrentExpanded ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            <span
              className={
                matchesSearch(`Array[${value.length}]`) ? 'bg-yellow-200 dark:bg-yellow-800' : ''
              }
            >
              Array[{value.length}]
            </span>
          </button>

          {isCurrentExpanded && (
            <div style={{ marginLeft: `${indent + 16}px` }} className="mt-1">
              {value.map((item, index) => {
                const itemPath = `${currentPath}[${index}]`;
                return (
                  <div key={index} className="py-0.5">
                    <span className="text-blue-600 dark:text-blue-400 mr-2">[{index}]:</span>
                    {renderValue(item, itemPath, depth + 1)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);

      if (keys.length === 0) {
        return <span className="text-gray-600 dark:text-gray-400">{'{}'}</span>;
      }

      const isCurrentExpanded = expandedPaths.has(currentPath);

      return (
        <div>
          <button
            onClick={() => onToggle(currentPath)}
            className="flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200"
          >
            <span
              className={`transform transition-transform text-xs ${isCurrentExpanded ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            <span
              className={
                matchesSearch(`Object (${keys.length} keys)`)
                  ? 'bg-yellow-200 dark:bg-yellow-800'
                  : ''
              }
            >
              Object ({keys.length} keys)
            </span>
          </button>

          {isCurrentExpanded && (
            <div style={{ marginLeft: `${indent + 16}px` }} className="mt-1">
              {keys.map((objKey) => {
                const keyPath = `${currentPath}.${objKey}`;
                const keyHighlighted = matchesSearch(objKey);
                return (
                  <div key={objKey} className="py-0.5">
                    <span
                      className={`text-red-600 dark:text-red-400 mr-2 ${keyHighlighted ? 'bg-yellow-200 dark:bg-yellow-800' : ''}`}
                    >
                      "{objKey}":
                    </span>
                    {renderValue(value[objKey], keyPath, depth + 1)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return <span className="text-gray-600 dark:text-gray-400">{String(value)}</span>;
  };

  return (
    <div style={{ marginLeft: `${indent}px` }} className="py-0.5">
      {renderValue(data, path)}
    </div>
  );
};

export default JsonTreeViewer;
