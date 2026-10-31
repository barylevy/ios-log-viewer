/// <reference types="wicg-file-system-access" />

interface Navigator {
  userAgentData?: { platform: string };
}

interface Window {
  launchQueue?: {
    setConsumer(
      callback: (launch: { files: FileSystemFileHandle[] }) => void | Promise<void>,
    ): void;
  };
}

interface WindowEventMap {
  scrollToLogIndex: CustomEvent<{
    index: number;
    logId: string | number;
    shouldHighlight: boolean;
  }>;
  showLogNotVisible: CustomEvent<{ lineNumber: number; message: string }>;
}
