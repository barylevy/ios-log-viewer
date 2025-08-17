import React from 'react';

const LogTabs = ({ files, activeFileIndex, onFileSelect, onFileClose, showCombined, onToggleCombined }) => {
    return (
        <div className="bg-white dark:bg-gray-900">
            <div className="flex items-center overflow-x-auto p-2 pb-0">
                {/* Combined View Toggle */}
                <div className="flex-shrink-0 px-4 py-2 mr-2 bg-gray-50 dark:bg-gray-800 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-600">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showCombined}
                            onChange={onToggleCombined}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-700"
                        />
                        <span className="text-gray-700 dark:text-gray-300">Combined View</span>
                    </label>
                </div>

                {/* File Tabs */}
                <div className="flex overflow-x-auto">
                    {files.map((file, index) => (
                        <div
                            key={index}
                            className={`flex items-center gap-2 px-4 py-2 mx-1 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-all duration-200 ${activeFileIndex === index && !showCombined
                                    ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-200 border-blue-300 dark:border-blue-600 shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                            onClick={() => onFileSelect(index)}
                        >
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({file.logs.length} lines)
                            </span>
                            {files.length > 1 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onFileClose(index);
                                    }}
                                    className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg"
                                    title="Close file"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Combined View Indicator */}
                {showCombined && (
                    <div className="flex-shrink-0 px-4 py-2 mx-1 bg-green-50 dark:bg-green-800 text-green-700 dark:text-green-200 rounded-t-lg border border-b-0 border-green-200 dark:border-green-600 shadow-sm">
                        <span className="text-sm font-medium">
                            All Files Combined ({files.reduce((total, file) => total + file.logs.length, 0)} total lines)
                        </span>
                    </div>
                )}
            </div>
            {/* Bottom border that connects to content */}
            <div className="border-b border-gray-200 dark:border-gray-700"></div>
        </div>
    );
};

export default LogTabs;
