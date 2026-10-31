import { parseFileContents } from '../domain/parseFile';

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    self.postMessage({ result: await parseFileContents(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Unable to parse log file.',
    });
  }
};
