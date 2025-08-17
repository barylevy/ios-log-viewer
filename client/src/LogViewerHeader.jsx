import React, { useRef, useState, useEffect } from 'react';

const LogViewerHeader = ({ onFileLoad, onToggleAIChat, showAIChat, hasLogs }) => {
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);
  const [showFileDialog, setShowFileDialog] = useState(false);

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.log') || file.name.toLowerCase().endsWith('.txt')) {
        onFileLoad(file);
      }
    });
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const handleDirectoryInputChange = (e) => {
    const files = Array.from(e.target.files);
    // Filter files that contain "log" in their name (case insensitive)
    const logFiles = files.filter(file => 
      file.name.toLowerCase().includes('log') ||
      file.type === 'text/plain' ||
      file.name.toLowerCase().endsWith('.txt')
    );
    
    logFiles.forEach(file => {
      onFileLoad(file);
    });
    
    // Reset input value to allow selecting the same directory again
    e.target.value = '';
  };

  const handleChooseFiles = () => {
    fileInputRef.current?.click();
    setShowFileDialog(false);
  };

  const handleChooseDirectory = () => {
    directoryInputRef.current?.click();
    setShowFileDialog(false);
  };

  const toggleFileDialog = () => {
    setShowFileDialog(!showFileDialog);
  };

  // Close dialog when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFileDialog && !event.target.closest('.file-dialog-container')) {
        setShowFileDialog(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFileDialog]);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <img src="/cato-logo.svg" alt="Cato Networks" className="h-8 w-auto" />
          <h1 className="text-xl font-semibold text-gray-900">iOS Log Viewer</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative file-dialog-container">
            <button
              onClick={toggleFileDialog}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Load Files
            </button>
            
            {showFileDialog && (
              <div className="absolute top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50 min-w-48">
                <div className="p-2">
                  <button
                    onClick={handleChooseFiles}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors"
                  >
                    📄 Choose Files
                  </button>
                  <button
                    onClick={handleChooseDirectory}
                    className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors"
                  >
                    📁 Choose Directory
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {hasLogs && (
            <button
              onClick={onToggleAIChat}
              className={`px-4 py-2 rounded-lg transition-colors ${
                showAIChat 
                  ? 'bg-purple-600 text-white hover:bg-purple-700' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              AI Chat
            </button>
          )}
        </div>
      </div>
      
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.log,text/plain"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={directoryInputRef}
        type="file"
        webkitdirectory=""
        directory=""
        onChange={handleDirectoryInputChange}
        className="hidden"
      />
    </header>
  );
};

export default LogViewerHeader;
