import { FS_SOURCES } from './liveLogsFsCore';
import { MIRROR_DIR_NAME } from './liveLogsFsHandle';

async function writeRequest(root, value) {
  const handle = await root.getFileHandle('.sync-request', { create: true });
  const writer = await handle.createWritable();
  await writer.write(value);
  await writer.close();
}

async function waitForStatus(root, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const handle = await root.getFileHandle('.sync-status');
      if ((await (await handle.getFile()).text()).trim() === expected) return;
    } catch (error) {
      if (error?.name !== 'NotFoundError') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('The sync script did not respond. Restart the updated sync-cato-logs.sh.');
}

/** Clear only known mirror folders, with copying paused, then await a fresh sync. */
export async function resetMirrorSession(root, timeoutMs = 10000) {
  if (root.name !== MIRROR_DIR_NAME) throw new Error(`Choose ${MIRROR_DIR_NAME}.`);
  const token = crypto.randomUUID();
  await writeRequest(root, `pause:${token}`);
  try {
    // A response with this unique token proves the script is running now.
    await waitForStatus(root, `pause:${token}`, timeoutMs);
    for (const { key } of FS_SOURCES) {
      try {
        await root.removeEntry(key, { recursive: true });
      } catch (error) {
        if (error?.name !== 'NotFoundError') throw error;
      }
    }
  } finally {
    await writeRequest(root, `sync:${token}`);
  }
  await waitForStatus(root, `ready:sync:${token}`, timeoutMs);
}
