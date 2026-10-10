/**
 * Minimal in-process queue: one heavy task (analysis or render) at a time per server process,
 * so Chrome + ffmpeg don't oversubscribe the machine. Survives Next.js dev hot reloads via globalThis.
 */
type Task = { key: string; run: () => Promise<unknown> };
type QueueState = { tasks: Task[]; running: string | null; pending: Set<string> };

const g = globalThis as unknown as { __cmkQueue?: QueueState };
const state: QueueState = (g.__cmkQueue ??= { tasks: [], running: null, pending: new Set() });

async function pump(): Promise<void> {
  if (state.running) return;
  const task = state.tasks.shift();
  if (!task) return;
  state.running = task.key;
  try {
    await task.run();
  } catch (err) {
    console.error(`[queue] ${task.key} failed:`, err);
  } finally {
    state.pending.delete(task.key);
    state.running = null;
    void pump();
  }
}

/** Enqueues a task unless one with the same key is already queued or running. */
export function enqueue(key: string, run: () => Promise<unknown>): boolean {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  state.tasks.push({ key, run });
  void pump();
  return true;
}
