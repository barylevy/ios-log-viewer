import React, { useState, useRef, useEffect } from 'react';

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

const ApiKeyInput = ({ onSubmit }) => {
    const [tempKey, setTempKey] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (tempKey.trim()) {
            onSubmit(tempKey.trim());
        }
    };

    return (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded">
            <h3 className="font-semibold mb-2 text-yellow-800 dark:text-yellow-200">OpenAI API Key Required</h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                To use AI chat, please enter your OpenAI API key.
            </p>
            <form onSubmit={handleSubmit} className="space-y-2">
                <input
                    type="password"
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                />
                <button type="submit" className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                    Save
                </button>
            </form>
        </div>
    );
};

const AIChat = ({ logs, fileName, isOpen, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [apiKey, setApiKey] = useState(retrieveApiKey());
    const [showApiKeyInput, setShowApiKeyInput] = useState(!apiKey);
    const messagesEndRef = useRef(null);

    if (!isOpen) return null;

    const handleApiKeySubmit = (key) => {
        storeApiKey(key);
        setApiKey(key);
        setShowApiKeyInput(false);
    };

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
                const text = typeof log === 'string' ? log : log.message || log.raw || JSON.stringify(log);
                return `[${index + 1}] ${text}`;
            }).join('\n');

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: `You are a log analysis assistant. Here are the logs:\n${logContext}`
                        },
                        { role: "user", content: userMessage }
                    ],
                    temperature: 0.3,
                    max_tokens: 1500,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `API error: ${response.status}`);
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
            if (e.metaKey || e.ctrlKey) {
                // Cmd+Enter or Ctrl+Enter: allow new line (default behavior)
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
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Chat</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Analyzing: {fileName}</p>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl"
                >
                    ×
                </button>
            </div>

            {showApiKeyInput && (
                <div className="p-4">
                    <ApiKeyInput onSubmit={handleApiKeySubmit} />
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !showApiKeyInput && (
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
                            className={`max-w-3xl p-3 rounded-lg ${
                                message.type === 'user'
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

            {!showApiKeyInput && (
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
                            placeholder="Ask about the logs... (Enter to send, Cmd+Enter for new line)"
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
        </div>
    );
};

export default AIChat;
