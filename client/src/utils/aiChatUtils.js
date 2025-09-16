// Utility functions for opening AI Chat in new window/tab

export const openAIChatInNewWindow = (logs, fileName) => {
    try {
        // Store log data in sessionStorage so the new window can access it
        sessionStorage.setItem('aiChatLogs', JSON.stringify(logs.slice(0, 100))); // Limit to first 100 logs to avoid storage limits
        sessionStorage.setItem('aiChatFileName', fileName);

        // Open new window with AI chat
        const chatWindow = window.open(
            '/ai-chat',
            'aiChatWindow',
            'width=800,height=600,scrollbars=yes,resizable=yes,status=yes,toolbar=no,menubar=no'
        );

        if (!chatWindow) {
            throw new Error('Popup blocked or failed to open');
        }

        // Send data to the new window after it loads (fallback method)
        const checkWindow = setInterval(() => {
            if (chatWindow.closed) {
                clearInterval(checkWindow);
                return;
            }

            try {
                if (chatWindow.postMessage) {
                    chatWindow.postMessage({
                        type: 'LOG_DATA',
                        logs: logs.slice(0, 100),
                        fileName: fileName
                    }, window.location.origin);
                    clearInterval(checkWindow);
                }
            } catch (e) {
                // Window not ready yet, continue trying
            }
        }, 100);

        // Clean up after 5 seconds
        setTimeout(() => clearInterval(checkWindow), 5000);

        return chatWindow;
    } catch (error) {
        console.error('Failed to open AI chat in new window:', error);
        alert('Failed to open AI chat in new window. Please check if popups are blocked.');
        return null;
    }
};

export const openAIChatInNewTab = (logs, fileName) => {
    try {
        // Store log data in sessionStorage
        sessionStorage.setItem('aiChatLogs', JSON.stringify(logs.slice(0, 100)));
        sessionStorage.setItem('aiChatFileName', fileName);

        // Open new tab
        const chatTab = window.open('/ai-chat', '_blank');

        if (!chatTab) {
            throw new Error('Failed to open new tab');
        }

        return chatTab;
    } catch (error) {
        console.error('Failed to open AI chat in new tab:', error);
        alert('Failed to open AI chat in new tab.');
        return null;
    }
};
