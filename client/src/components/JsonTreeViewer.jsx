import React, { useState, useMemo, useEffect } from 'react';

const JsonTreeViewer = ({ data, searchQuery = '', expandedPaths: externalExpandedPaths, onTogglePath, hideControls = false }) => {
    const [internalExpandedPaths, setInternalExpandedPaths] = useState(new Set());
    const [localSearchQuery, setLocalSearchQuery] = useState('');

    // Use external controls if provided, otherwise use internal state
    const expandedPaths = externalExpandedPaths || internalExpandedPaths;
    const activeSearchQuery = localSearchQuery || searchQuery;

    const getAllPaths = (obj, currentPath) => {
        const allPaths = new Set();
        const addPaths = (obj, currentPath) => {
            if (typeof obj === 'object' && obj !== null) {
                allPaths.add(currentPath);
                if (Array.isArray(obj)) {
                    obj.forEach((_, index) => {
                        addPaths(obj[index], `${currentPath}[${index}]`);
                    });
                } else {
                    Object.keys(obj).forEach(key => {
                        addPaths(obj[key], currentPath ? `${currentPath}.${key}` : key);
                    });
                }
            }
        };
        addPaths(obj, currentPath);
        return allPaths;
    };

    // Expand all nodes by default when component mounts or data changes (only for internal state)
    useEffect(() => {
        if (data && !externalExpandedPaths) {
            const allPaths = getAllPaths(data, 'root');
            setInternalExpandedPaths(allPaths);
        }
    }, [data, externalExpandedPaths]);

    const expandAll = () => {
        const allPaths = getAllPaths(data, 'root');
        if (externalExpandedPaths && onTogglePath) {
            // External control - not implemented here since parent handles it
        } else {
            setInternalExpandedPaths(allPaths);
        }
    };

    const collapseAll = () => {
        if (externalExpandedPaths && onTogglePath) {
            // External control - not implemented here since parent handles it
        } else {
            setInternalExpandedPaths(new Set());
        }
    };

    const togglePath = (path) => {
        if (onTogglePath) {
            onTogglePath(path);
        } else {
            setInternalExpandedPaths(prev => {
                const newSet = new Set(prev);
                if (newSet.has(path)) {
                    newSet.delete(path);
                } else {
                    newSet.add(path);
                }
                return newSet;
            });
        }
    };

    const matchesSearch = useMemo(() => {
        if (!activeSearchQuery) return () => false;
        const query = activeSearchQuery.toLowerCase();
        return (text) => text.toLowerCase().includes(query);
    }, [activeSearchQuery]);

    const JsonNode = ({ data, path, level, expandedPaths, onToggle, searchQuery, matchesSearch, keyName = null, inline = false }) => {
        const isExpanded = expandedPaths.has(path);
        const indent = inline ? 0 : level * 16;

        const renderValue = (value, key = null, currentPath = path) => {
            if (value === null) {
                return <span className="text-gray-500 dark:text-gray-400">null</span>;
            }

            if (typeof value === 'boolean') {
                const text = value.toString();
                const isHighlighted = matchesSearch(text);
                return (
                    <span className={`text-purple-600 dark:text-purple-400 font-semibold ${isHighlighted ? 'bg-yellow-200 dark:bg-yellow-800 px-1 rounded' : ''}`}>
                        {text}
                    </span>
                );
            }

            if (typeof value === 'number') {
                const text = value.toString();
                const isHighlighted = matchesSearch(text);
                return (
                    <span className={`text-blue-600 dark:text-blue-400 font-semibold ${isHighlighted ? 'bg-yellow-200 dark:bg-yellow-800 px-1 rounded' : ''}`}>
                        {text}
                    </span>
                );
            }

            if (typeof value === 'string') {
                const isHighlighted = matchesSearch(value);
                return (
                    <span className={`text-green-600 dark:text-green-400 ${isHighlighted ? 'bg-yellow-200 dark:bg-yellow-800 px-1 rounded' : ''}`}>
                        "{value}"
                    </span>
                );
            }

            if (Array.isArray(value)) {
                if (value.length === 0) {
                    return <span className="text-gray-600 dark:text-gray-400">[]</span>;
                }

                return (
                    <div>
                        <button
                            onClick={() => onToggle(currentPath)}
                            className="inline-flex items-center justify-center w-5 h-5 mr-2 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded border transition-colors"
                        >
                            {isExpanded ? '▼' : '▶'}
                        </button>
                        <span className="text-gray-600 dark:text-gray-400">
                            [{value.length} items]
                        </span>
                        {isExpanded && (
                            <div className="ml-6 mt-1">
                                {value.map((item, index) => {
                                    const itemPath = `${currentPath}[${index}]`;
                                    return (
                                        <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1">
                                            <span className="text-blue-600 dark:text-blue-400 font-semibold text-xs mr-2">
                                                [{index}]:
                                            </span>
                                            <JsonNode
                                                data={item}
                                                path={itemPath}
                                                level={level + 1}
                                                expandedPaths={expandedPaths}
                                                onToggle={onToggle}
                                                searchQuery={searchQuery}
                                                matchesSearch={matchesSearch}
                                                keyName={null}
                                                inline={true}
                                            />
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

                return (
                    <div>
                        <button
                            onClick={() => onToggle(currentPath)}
                            className="inline-flex items-center justify-center w-5 h-5 mr-2 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded border transition-colors"
                        >
                            {isExpanded ? '▼' : '▶'}
                        </button>
                        <span className="text-gray-600 dark:text-gray-400">
                            {'{'}...{'}'}
                        </span>
                        {isExpanded && (
                            <div className="ml-6 mt-1">
                                {keys.map(objKey => {
                                    const keyPath = currentPath ? `${currentPath}.${objKey}` : objKey;
                                    const isKeyHighlighted = matchesSearch(objKey);
                                    return (
                                        <div key={objKey} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1">
                                            <span className={`text-red-600 dark:text-red-400 font-semibold mr-2 ${isKeyHighlighted ? 'bg-yellow-200 dark:bg-yellow-800' : ''}`}>
                                                "{objKey}":
                                            </span>
                                            <JsonNode
                                                data={value[objKey]}
                                                path={keyPath}
                                                level={level + 1}
                                                expandedPaths={expandedPaths}
                                                onToggle={onToggle}
                                                searchQuery={searchQuery}
                                                matchesSearch={matchesSearch}
                                                keyName={null}
                                                inline={true}
                                            />
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
            <div
                style={{ marginLeft: inline ? 0 : `${indent}px` }}
                className={inline ? "inline-flex items-center flex-wrap" : "py-1 flex items-start"}
            >
                <div className="flex items-center flex-wrap">
                    {keyName && (
                        <span className="text-red-600 dark:text-red-400 font-semibold mr-2">"{keyName}":</span>
                    )}
                    {renderValue(data, keyName, path)}
                </div>
            </div>
        );
    };

    return (
        <div className="json-tree-viewer">
            {!hideControls && (
                <div className="json-controls mb-4 flex gap-2 items-center flex-wrap">
                    <button
                        onClick={expandAll}
                        className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
                    >
                        Expand All
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                    >
                        Collapse All
                    </button>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search in JSON..."
                            value={localSearchQuery}
                            onChange={(e) => setLocalSearchQuery(e.target.value)}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {localSearchQuery && (
                            <button
                                onClick={() => setLocalSearchQuery('')}
                                className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                title="Clear search"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            )}
            <div className="json-content bg-gray-50 dark:bg-gray-900 p-4 rounded border font-mono text-sm">
                <JsonNode
                    data={data}
                    path="root"
                    level={0}
                    expandedPaths={expandedPaths}
                    onToggle={togglePath}
                    searchQuery={activeSearchQuery}
                    matchesSearch={matchesSearch}
                />
            </div>
        </div>
    );
};

export default JsonTreeViewer;
