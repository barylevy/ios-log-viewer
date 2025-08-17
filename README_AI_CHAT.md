# iOS Log Viewer with AI Chat (Client-Side)

An advanced iOS log viewer with client-side AI-powered chat functionality for analyzing log files.

## Features

- **Interactive Log Viewing**: Browse and filter iOS log files with real-time updates
- **Client-Side AI Chat**: Ask questions about your logs directly from the browser
- **No Server Required**: AI functionality works entirely in the browser
- **Export/Import**: Save and load log files for later analysis
- **Advanced Filtering**: Filter by text, date range, and log levels
- **Secure**: API key stored locally in your browser

## Setup Instructions

### 1. Install Client Dependencies

```bash
cd client
npm install
```

### 2. Configure OpenAI API Key

When you first use the AI chat, you'll be prompted to enter your OpenAI API key:
- Your API key will be encrypted and stored securely in your browser's localStorage
- Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- The key is only stored locally and never sent to any server

### 3. Start the Application

```bash
cd client
npm run dev
```
Application will run on: http://localhost:3000

## Using the AI Chat

1. **Load Log Files**: Click "📁 Import Log" to load your iOS log files
2. **Open AI Chat**: Click the "💬 AI Chat" button in the header
3. **Enter API Key**: If prompted, enter your OpenAI API key (will be saved locally)
4. **Ask Questions**: Type questions about your logs like:
   - "What errors do you see in the logs?"
   - "Are there any performance issues?"
   - "What patterns do you notice?"
   - "Summarize what the app is doing"

## API Key Management

- **Secure Storage**: API key is encrypted using base64 encoding before storing in localStorage
- **Clear API Key**: Click "� Reset Key" in the chat header to remove saved key
- **Privacy**: All processing happens client-side with direct OpenAI API calls
- **Migration**: Old unencrypted keys are automatically migrated to encrypted storage

## Architecture

- **Frontend**: React + Vite + Tailwind CSS
- **AI**: Direct OpenAI API calls from browser using GPT-4o-mini
- **Storage**: Browser localStorage for API key and preferences
- **No Backend**: All functionality works client-side

## Advantages of Client-Side Implementation

✅ **No Server Required**: Works entirely in the browser  
✅ **Privacy**: Your logs never leave your browser  
✅ **Simple Deployment**: Just static files to host  
✅ **Fast**: Direct API calls to OpenAI without server overhead  

## Deployment to Vercel

Since this is a client-only application with no environment variables needed:

1. **Deploy**: Simply run `vercel --prod`
2. **That's it!** Users will enter their own API keys when using the chat

No server configuration or environment variables required.

## Troubleshooting

**AI Chat not working:**
- Make sure you have a valid OpenAI API key
- Check browser console for error messages
- Try clearing the API key and re-entering it

**Client build errors:**
- Make sure all dependencies are installed: `npm install`
- Try clearing node_modules and reinstalling
