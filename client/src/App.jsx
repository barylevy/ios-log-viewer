import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LogViewer from './LogViewer';
import AIChatPage from './AIChatPage';

const App = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LogViewer />} />
                <Route path="/ai-chat" element={<AIChatPage />} />
            </Routes>
        </Router>
    );
};

export default App;
