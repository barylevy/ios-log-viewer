import React, { useState, useEffect } from 'react';
import { AI_CONTEXT_MESSAGE } from './resources/aiContext';

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

const AIConfigSettings = ({ isOpen, onClose }) => {
    const [apiKey, setApiKey] = useState('');
    const [tempKey, setTempKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [contextMessage, setContextMessage] = useState('');
    const [tempContextMessage, setTempContextMessage] = useState('');

    useEffect(() => {
        if (isOpen) {
            const currentKey = retrieveApiKey();
            setApiKey(currentKey);
            setTempKey(currentKey);
            
            // Load custom context message or use default
            const savedContext = localStorage.getItem('ai_context_message');
            const currentContext = savedContext || AI_CONTEXT_MESSAGE;
            setContextMessage(currentContext);
            setTempContextMessage(currentContext);
            
            setSaveMessage('');
        }
    }, [isOpen]);

    const handleSave = () => {
        let saved = false;
        
        if (tempKey.trim()) {
            storeApiKey(tempKey.trim());
            setApiKey(tempKey.trim());
            saved = true;
        }
        
        if (tempContextMessage.trim()) {
            localStorage.setItem('ai_context_message', tempContextMessage.trim());
            setContextMessage(tempContextMessage.trim());
            saved = true;
        }
        
        if (saved) {
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    const handleClear = () => {
        localStorage.removeItem('openai_api_key_enc');
        localStorage.removeItem('openai_api_key');
        setApiKey('');
        setTempKey('');
        setSaveMessage('API key cleared!');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    const handleReset = () => {
        setTempKey(apiKey);
        setTempContextMessage(contextMessage);
        setSaveMessage('');
    };

    const handleResetToDefault = () => {
        setTempContextMessage(AI_CONTEXT_MESSAGE);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Configuration Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                        <span className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">✕</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    <div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">AI Chat Configuration</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Configure your OpenAI API key to enable AI chat functionality.
                        </p>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    OpenAI API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showKey ? "text" : "password"}
                                        value={tempKey}
                                        onChange={(e) => setTempKey(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full p-2 pr-10 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowKey(!showKey)}
                                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    >
                                        {showKey ? "🙈" : "👁️"}
                                    </button>
                                </div>
                            </div>

                            {/* Current Status */}
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Status: {apiKey ? '✅ API key configured' : '❌ No API key set'}
                            </div>

                            {/* Save Message */}
                            {saveMessage && (
                                <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                                    {saveMessage}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Context Message Configuration */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                AI Context Message
                            </label>
                            <button
                                onClick={handleResetToDefault}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Reset to Default
                            </button>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                            This message is sent to the AI at the beginning of each conversation to provide context.
                        </p>
                        <textarea
                            value={tempContextMessage}
                            onChange={(e) => setTempContextMessage(e.target.value)}
                            rows={8}
                            placeholder="Enter your context message..."
                            className="w-full p-2 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                        />
                    </div>

                    {/* Help Text */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                        <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                            How to get an OpenAI API key:
                        </h4>
                        <ol className="text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                            <li>Visit <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline cursor-pointer">platform.openai.com</a></li>
                            <li>Sign up or log in to your account</li>
                            <li>Go to <a href="https://platform.openai.com/settings/organization/api-keys" target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline cursor-pointer">API keys page</a></li>
                            <li>Create a new API key</li>
                            <li>Copy and paste it here</li>
                        </ol>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                        Clear Key
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                            Reset
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!tempKey.trim() && !tempContextMessage.trim()}
                            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIConfigSettings;
