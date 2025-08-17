import React from 'react';

const FileSelectionModal = ({ isOpen, onClose, onChooseFiles, onChooseDirectory }) => {
    if (!isOpen) return null;

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
        >
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 shadow-xl border border-gray-600">
                <h2 className="text-xl font-semibold text-white mb-6 text-center">
                    Choose Loading Method
                </h2>

                <div className="space-y-4">
                    <button
                        onClick={onChooseFiles}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-lg font-medium transition-colors text-lg"
                    >
                        📄 Select Individual Files
                    </button>

                    <button
                        onClick={onChooseDirectory}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-4 px-6 rounded-lg font-medium transition-colors text-lg"
                    >
                        📁 Select Entire Folder
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-6 bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default FileSelectionModal;
