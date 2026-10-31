/** Read an OS folder drop through the browser's entry API, preserving relative paths. */
export async function collectDroppedFiles(entries: (FileSystemEntry | null)[]): Promise<File[]> {
  const result: File[] = [];
  async function readDirectory(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
    const children: FileSystemEntry[] = [];
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) return children;
      children.push(...batch);
    }
  }
  async function walk(entry: FileSystemEntry | null, prefix: string): Promise<void> {
    if (!entry) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      Object.defineProperty(file, 'webkitRelativePath', {
        value: prefix ? `${prefix}/${file.name}` : file.name,
        configurable: true,
      });
      result.push(file);
    } else if (entry.isDirectory) {
      const children = await readDirectory((entry as FileSystemDirectoryEntry).createReader());
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      for (const child of children) await walk(child, path);
    }
  }
  for (const entry of entries) await walk(entry, '');
  return result;
}
