import React, { useState, useEffect } from 'react';
import AIChat from './AIChat';
import AIConfigSettings from './Settings';

const AIChatPage = () => {
    const [logs, setLogs] = useState([]);
    const [fileName, setFileName] = useState('');
    const [loading, setLoading] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Apply dark mode based on user's preference
    useEffect(() => {
        const isDarkMode = localStorage.getItem('theme') === 'dark' ||
            (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    useEffect(() => {
        // Get log data from sessionStorage or URL parameters
        const loadLogData = () => {
            try {
                // First try to get from sessionStorage (preferred method)
                const storedLogs = sessionStorage.getItem('aiChatLogs');
                const storedFileName = sessionStorage.getItem('aiChatFileName');

                if (storedLogs && storedFileName) {
                    setLogs(JSON.parse(storedLogs));
                    setFileName(storedFileName);
                    setLoading(false);
                    return;
                }

                // Fallback to URL parameters (for direct links)
                const urlParams = new URLSearchParams(window.location.search);
                const encodedLogs = urlParams.get('logs');
                const encodedFileName = urlParams.get('fileName');

                if (encodedLogs && encodedFileName) {
                    setLogs(JSON.parse(decodeURIComponent(encodedLogs)));
                    setFileName(decodeURIComponent(encodedFileName));
                    setLoading(false);
                    return;
                }

                // If no data found, show message
                setFileName('No log file loaded');
                setLoading(false);
            } catch (error) {
                console.error('Error loading log data:', error);
                setFileName('Error loading logs');
                setLoading(false);
            }
        };

        loadLogData();

        // Listen for messages from parent window (if opened as popup)
        const handleMessage = (event) => {
            if (event.data.type === 'LOG_DATA') {
                setLogs(event.data.logs);
                setFileName(event.data.fileName);
                setLoading(false);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleClose = () => {
        // If this is a popup window, close it
        if (window.opener) {
            window.close();
        } else {
            // If this is a tab, go back to the main app or close
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.close();
            }
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading AI Chat...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-600 p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <img src="/cato-logo.svg" alt="Cato Networks" className="h-8 w-auto" />
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                                AI Chat - Log Analysis
                            </h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {fileName}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="px-3 py-2 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors flex items-center space-x-1"
                            title="Settings"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>Settings</span>
                        </button>
                        <button
                            onClick={() => window.open(window.location.origin, '_blank')}
                            className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                        >
                            Open Log Viewer
                        </button>
                        <button
                            onClick={handleClose}
                            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* AI Chat Content */}
            <div className="flex-1 overflow-hidden">
                <AIChat
                    logs={logs}
                    fileName={fileName}
                    isOpen={true}
                    onClose={handleClose}
                    isFullWidth={true}
                    onToggleFullWidth={() => { }} // No-op since it's always full width
                />
            </div>

            {/* Settings Modal */}
            <AIConfigSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
};

export default AIChatPage;
