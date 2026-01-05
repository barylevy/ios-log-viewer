import React, { useState, useRef, useEffect } from 'react';
import AIConfigSettings from './Settings';

// Simple encryption/decryption for API key storage
const encryptKey = (key) => {
    try {
        return btoa(unescape(encodeURIComponent(key)));
    } catch (e) {
        return key;
    }
};

const decryptKey = (encrypted) => {
    try {
        return decodeURIComponent(escape(atob(encrypted)));
    } catch (e) {
        return encrypted;
    }
};

const storeApiKey = (key) => {
    const encrypted = encryptKey(key);
    localStorage.setItem('openai_api_key_enc', encrypted);
    localStorage.removeItem('openai_api_key');
};

const retrieveApiKey = () => {
    const encrypted = localStorage.getItem('openai_api_key_enc');
    if (encrypted) {
        return decryptKey(encrypted);
    }

    const oldKey = localStorage.getItem('openai_api_key');
    if (oldKey) {
        storeApiKey(oldKey);
        localStorage.removeItem('openai_api_key');
        return oldKey;
    }

    return '';
};

// Helper function to format file name for display
const formatFileNameForDisplay = (fileName) => {
    if (!fileName) return '';

    let displayName = fileName;

    // If the filename doesn't contain spaces, show only the suffix (last part after the last slash or backslash)
    if (!fileName.includes(' ')) {
        const parts = fileName.split(/[/\\]/);
        displayName = parts[parts.length - 1];
    }

    // Show only the last 30 characters
    if (displayName.length > 30) {
        displayName = '...' + displayName.slice(-27);
    }

    return displayName;
};

const AIChat = ({ logs, fileName, isOpen, onClose, isFullWidth, onToggleFullWidth }) => {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const messagesEndRef = useRef(null);

    // Check for API key on component mount and when panel opens
    useEffect(() => {
        if (isOpen) {
            const currentKey = retrieveApiKey();
            setApiKey(currentKey);
        }
    }, [isOpen, settingsOpen]);

    // Scroll to the latest message when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    if (!isOpen) return null;

    const sendMessage = async () => {
        if (!inputMessage.trim() || isLoading) return;

        const userMessage = inputMessage.trim();
        setInputMessage('');
        setError('');
        setIsLoading(true);

        const newUserMessage = {
            id: Date.now(),
            type: 'user',
            content: userMessage,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, newUserMessage]);

        try {
            if (!apiKey) {
                throw new Error('Please configure your OpenAI API key first.');
            }

            const logContext = logs.slice(0, 50).map((log, index) => {
                // More robust text extraction
                let text = '';
                if (typeof log === 'string') {
                    text = log;
                } else if (log && typeof log === 'object') {
                    // Try different possible properties
                    text = log.message || log.raw || log.content || log.text || log.line || JSON.stringify(log);
                } else {
                    text = String(log);
                }
                return `[${index + 1}] ${text}`;
            }).join('\n');

            const systemMessage = logContext.length > 0
                ? `You are a log analysis assistant. Here are the logs from file "${fileName}":\n\n${logContext}\n\nAnalyze these logs and answer questions about them.`
                : `You are a log analysis assistant. The user is asking about logs from file "${fileName}", but no log content was provided. Please ask them to load some logs first.`;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemMessage },
                        { role: "user", content: userMessage }
                    ],
                    temperature: 0.3,
                    max_tokens: 1500,
                })
            });

            if (!response.ok) {
                let errorMessage = `API error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error?.message || errorData.message || errorMessage;
                } catch (e) {
                    const text = await response.text();
                    if (text) errorMessage = text;
                }
                console.error(`${provider} API Error:`, errorMessage);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const assistantResponse = data.choices[0]?.message?.content;

            if (!assistantResponse) {
                throw new Error('No response from AI');
            }

            const assistantMessage = {
                id: Date.now() + 1,
                type: 'assistant',
                content: assistantResponse,
                timestamp: new Date().toISOString()
            };

            setMessages(prev => [...prev, assistantMessage]);

        } catch (error) {
            console.error('AI Chat error:', error);
            setError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift+Enter: allow new line (default behavior)
                return;
            } else {
                // Enter: send message
                e.preventDefault();
                sendMessage();
            }
        }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-900">
            <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                        AI Chat
                        <span className="text-xs font-normal text-gray-600 dark:text-gray-400 ml-2">
                            - {formatFileNameForDisplay(fileName)}
                        </span>
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Settings"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                    <button
                        onClick={onToggleFullWidth}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={isFullWidth ? "Exit full width" : "Full width"}
                    >
                        {isFullWidth ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl"
                    >
                        ×
                    </button>
                </div>
            </div>

            {!apiKey && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded mx-4">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <span className="text-yellow-400">⚠️</span>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                OpenAI API Key Required
                            </h3>
                            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                                <p>To use AI chat, please configure your OpenAI API key in Settings.</p>
                                <p className="mt-1 text-xs">Click the "Settings" button (⚙️) to get started.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && apiKey && (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        <p>Start a conversation about your logs!</p>
                    </div>
                )}

                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`w-full p-3 rounded-lg ${message.type === 'user'
                                ? 'bg-blue-500 text-white'
                                : message.type === 'error'
                                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                                }`}
                        >
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            <div className="text-xs opacity-70 mt-2">
                                {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                            <div className="flex items-center space-x-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                <span className="text-gray-600 dark:text-gray-400">AI is thinking...</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {apiKey && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    {error && (
                        <div className="mb-2 p-2 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-sm">
                            {error}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <textarea
                            value={inputMessage}
                            onChange={(e) => setInputMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about the logs... (Enter to send, Shift+Enter for new line)"
                            className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            rows="3"
                            disabled={isLoading}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={isLoading || !inputMessage.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed h-fit"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            <AIConfigSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
};

export default AIChat;
