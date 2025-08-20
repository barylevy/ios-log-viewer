import React from 'react';

const LogTabs = ({ files, activeFileIndex, onFileSelect, onFileClose, showingCombinedView, onCombinedViewSelect, allFileLogs = {} }) => {
    return (
        <div className="bg-white dark:bg-gray-900">
            <div className="flex items-center overflow-x-auto p-2 pb-0">
                {/* File Tabs */}
                <div className="flex overflow-x-auto w-full">
                    {files.map((file, index) => (
                        <div
                            key={index}
                            className={`flex items-center gap-2 px-4 py-1 mx-1 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-all duration-200 ${activeFileIndex === index && !showingCombinedView
                                ? 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-200 border-blue-300 dark:border-blue-600 shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                }`}
                            onClick={() => {
                                console.log('🏷️ Tab clicked:', { index, fileName: file.name, currentActive: activeFileIndex });
                                onFileSelect(index);
                            }}
                        >
                            <span className="text-sm font-medium">{file.name}</span>
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
                    ))}

                    {/* Combined View Tab - only show when multiple files */}
                    {files.length > 1 && (
                        <div
                            className={`flex items-center gap-2 px-4 py-1 mx-1 rounded-t-lg border border-b-0 cursor-pointer whitespace-nowrap transition-all duration-200 ${showingCombinedView
                                ? 'bg-green-50 dark:bg-green-800 text-green-700 dark:text-green-200 border-green-300 dark:border-green-600 shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-200 hover:bg-green-50 dark:hover:bg-green-800 border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-600'
                                }`}
                            onClick={() => {
                                console.log('🔄 Combined view tab clicked');
                                onCombinedViewSelect();
                            }}
                        >
                            <span className="text-sm font-medium">All Files</span>
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
