import { parseFileContents, type ParsedFile } from '../domain/parseFile';

/** One worker at a time bounds memory when a folder contains many large files. */
class LogParserClient {
  private queue: Promise<unknown> = Promise.resolve();

  parse(file: File): Promise<ParsedFile> {
    const operation = this.queue.then(() => this.parseInWorker(file));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  private async parseInWorker(file: File): Promise<ParsedFile> {
    if (typeof Worker === 'undefined' || file.size < 1024 * 1024) return parseFileContents(file);
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../workers/logParser.worker.ts', import.meta.url), {
        type: 'module',
      });
      const finish = () => {
        clearTimeout(timeout);
        worker.terminate();
      };
      const timeout = setTimeout(() => {
        finish();
        reject(new Error('Parsing took too long. Try opening a smaller log file.'));
      }, 30000);
      worker.onmessage = (event: MessageEvent<{ result?: ParsedFile; error?: string }>) => {
        finish();
        if (event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.error || 'Unable to parse log file.'));
      };
      worker.onerror = () => {
        finish();
        reject(new Error('The log parsing worker failed.'));
      };
      worker.postMessage(file);
    });
  }
}

const parser = new LogParserClient();
export function parseLogFile(file: File): Promise<ParsedFile> {
  return parser.parse(file);
}
