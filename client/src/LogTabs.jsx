import React from 'react';
import { getFileDisplayName, getFileFullName } from './useLogsModel';

const LogTabs = ({ files, activeFileIndex, onFileSelect, onFileClose, showingCombinedView, onCombinedViewSelect, allFileLogs = {}, isFileLoading, onCloseAll }) => {
    return (
        <div className="bg-white dark:bg-gray-900">
            <div className="flex items-center overflow-x-auto p-2 pb-0">
                {/* File Tabs */}
                <div className="flex overflow-x-auto flex-1">
                    {files.map((file, index) => {
                        const loading = isFileLoading ? isFileLoading(file.id) : false;
                        return (
                            <div
                                key={index}
                                className={`flex items-center gap-2 px-4 py-1 mx-1 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-all duration-200 ${activeFileIndex === index && !showingCombinedView
                                    ? 'bg-white dark:bg-gray-800 border-blue-400 dark:border-blue-400 shadow-sm'
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
                                ? 'bg-green-50 dark:bg-green-800 border-2 border-green-500 dark:border-green-500 shadow-sm'
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

                {/* Close All Button */}
                {files.length > 0 && (
                    <button
                        onClick={onCloseAll}
                        className="flex-shrink-0 ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-300 transition-colors border border-gray-300 dark:border-gray-600"
                        title="Close all files"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
            {/* Bottom border that connects to content */}
            <div className="border-b border-gray-200 dark:border-gray-700"></div>
        </div>
    );
};

export default LogTabs;
