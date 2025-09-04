import React from 'react';
import { getFileDisplayName, getFileFullName } from './useLogsModel';

const LogTabs = ({ files, activeFileIndex, onFileSelect, onFileClose, showingCombinedView, onCombinedViewSelect, allFileLogs = {}, isFileLoading }) => {
    return (
        <div className="bg-white dark:bg-gray-900">
            <div className="flex items-center overflow-x-auto p-2 pb-0">
                {/* File Tabs */}
                <div className="flex overflow-x-auto w-full">
                    {files.map((file, index) => {
                        const loading = isFileLoading ? isFileLoading(file.id) : false;
                        return (
                            <div
                                key={index}
                                className={`flex items-center gap-2 px-4 py-1 mx-1 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-all duration-200 ${activeFileIndex === index && !showingCombinedView
                                    ? 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600 shadow-sm'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                onClick={() => {
                                    onFileSelect(index);
                                }}
                                title={getFileFullName(file.id)}
                            >
                                <span className="text-xs flex items-center">
                                    {getFileDisplayName(file.id)}
                                    {loading && (
                                        <svg className="ml-2 animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                        </svg>
                                    )}
                                </span>
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
                            </div>
                        );
                    })}

                    {/* Combined View Tab - only show when multiple files */}
                    {files.length > 1 && (
                        <div
                            className={`flex items-center gap-2 px-4 py-1 mx-1 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-all duration-200 ${showingCombinedView
                                ? 'bg-green-50 dark:bg-green-800 border-green-300 dark:border-green-600 shadow-sm'
                                : 'hover:bg-green-50 dark:hover:bg-green-800 border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-600'
                                }`}
                            onClick={() => {
                                onCombinedViewSelect();
                            }}
                        >
                            <span className="text-xs">All Files</span>
                        </div>
                    )}
                </div>
            </div>
            {/* Bottom border that connects to content */}
            <div className="border-b border-gray-200 dark:border-gray-700"></div>
        </div>
    );
};

export default LogTabs;
