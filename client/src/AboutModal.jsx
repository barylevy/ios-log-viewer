import React, { useEffect, useRef } from 'react';

const AboutModal = ({ isOpen, onClose }) => {
    const modalRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        // Escape key closes modal
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Click outside closes modal
    const handleBackdropClick = (e) => {
        if (modalRef.current && !modalRef.current.contains(e.target)) {
            onClose();
        }
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40" onMouseDown={handleBackdropClick}>
            <div ref={modalRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-lg w-full p-6 relative">
                <button
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl"
                    onClick={onClose}
                    aria-label="Close"
                >
                    ×
                </button>
                <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-100">About - Cato Client Log Viewer</h2>
                <p className="mb-4 text-gray-700 dark:text-gray-200">
                    <b>Cato Client Log Viewer</b> is a modern web application for viewing, searching, and analyzing log files from all Cato client types: <b>Windows, Apple, Linux, and Android</b>.<br />
                    <br />
                    <b>Features:</b>
                    <ul className="list-disc ml-6 my-2">
                        <li>Load multiple log files or entire folders</li>
                        <li>Advanced filtering (by text, log level, date, and more)</li>
                        <li>Multi-line log grouping and context display</li>
                        <li>Search with highlighting and navigation</li>
                        <li>Tabbed view for multiple files</li>
                        <li>AI-powered log analysis (optional)</li>
                        <li>Modern, responsive UI with dark mode</li>
                    </ul>
                    <br />
                    If you have ideas, feedback, or encounter any issues, please contact:
                    <br />
                    <a href="mailto:bari.levi@catonetworks.com" className="text-blue-600 dark:text-blue-400 underline">bari.levi@catonetworks.com</a>
                    <br />
                    <button
                        type="button"
                        onClick={() => {
                            // Try to open Slack app, fallback to web
                            const slackAppUrl = 'slack://user?team=T00000000&id=U00000000'; // Replace with real team/user if known
                            const slackWebUrl = 'https://slack.com/app_redirect?channel=@bari.levi';
                            const win = window.open(slackAppUrl);
                            setTimeout(() => {
                                // If app didn't open, fallback to web
                                if (win) win.location = slackWebUrl;
                            }, 500);
                        }}
                        className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm"
                        style={{
                            background: 'linear-gradient(90deg, #611f69 0%, #36c5f0 100%)',
                            color: 'white',
                            border: 'none'
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 122.8 122.8" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="122.8" height="122.8" rx="24" fill="#fff" />
                            <g>
                                <path d="M30.3 77.2c0 6.1-5 11.1-11.1 11.1S8 83.3 8 77.2s5-11.1 11.1-11.1h11.1v11.1zm5.6 0c0-6.1 5-11.1 11.1-11.1s11.1 5 11.1 11.1v27.8c0 6.1-5 11.1-11.1 11.1s-11.1-5-11.1-11.1V77.2zm11.1-33.4c-6.1 0-11.1-5-11.1-11.1S40.9 21.6 47 21.6s11.1 5 11.1 11.1v11.1H47zm0 5.6c6.1 0 11.1 5 11.1 11.1s-5 11.1-11.1 11.1H19.2c-6.1 0-11.1-5-11.1-11.1s5-11.1 11.1-11.1H47zm33.4 11.1c0-6.1 5-11.1 11.1-11.1s11.1 5 11.1 11.1-5 11.1-11.1 11.1H80.5V58.3zm-5.6 0c0 6.1-5 11.1-11.1 11.1s-11.1-5-11.1-11.1V30.5c0-6.1 5-11.1 11.1-11.1s11.1 5 11.1 11.1v27.8zm-11.1 33.4c6.1 0 11.1 5 11.1 11.1s-5 11.1-11.1 11.1-11.1-5-11.1-11.1V80.5h11.1zm0-5.6c-6.1 0-11.1-5-11.1-11.1s5-11.1 11.1-11.1h27.8c6.1 0 11.1 5 11.1 11.1s-5 11.1-11.1 11.1H80.5z" fill="#611f69" />
                            </g>
                        </svg>
                        Send message on Slack
                    </button>
                </p>
            </div>
        </div>
    );
};

export default AboutModal;
