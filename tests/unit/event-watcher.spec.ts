import { describe, expect, it } from 'bun:test';
import { EventWatcher } from '../../src/engine/event-watcher';

/** A type alias, not `interface ... extends EventRecord` — see helpers.ts. */
type Events = {
  ready: { id: string };
  tick: number;
};

describe('EventWatcher', () => {
  describe('resolution', () => {
    it('resolves with the payload of the next emit', async () => {
      const watcher = new EventWatcher<Events>(1000);
      const pending = watcher.watch('ready');

      watcher.onEmit('ready', { id: 'r1' });

      expect(await pending).toEqual({ id: 'r1' });
      watcher.shutdown();
    });

    it('settles every waiter registered for the same event', async () => {
      const watcher = new EventWatcher<Events>(1000);
      const first = watcher.watch('tick');
      const second = watcher.watch('tick');
      const third = watcher.watch('tick');

      watcher.onEmit('tick', 42);

      expect(await Promise.all([first, second, third])).toEqual([42, 42, 42]);
      watcher.shutdown();
    });

    it('leaves watchers for other events untouched', async () => {
      const watcher = new EventWatcher<Events>(40);
      const ready = watcher.watch('ready');
      const tick = watcher.watch('tick');

      watcher.onEmit('tick', 1);

      expect(await tick).toBe(1);
      expect(watcher.pending).toBe(1);
      await expect(ready).rejects.toThrow(/timed out/);
      watcher.shutdown();
    });

    it('is one-shot: a settled watcher does not catch the following emit', async () => {
      const watcher = new EventWatcher<Events>(1000);
      const first = watcher.watch('tick');
      watcher.onEmit('tick', 1);
      await first;

      expect(watcher.pending).toBe(0);

      // The event key must be gone, or this emit would resolve a dead promise.
      expect(() => watcher.onEmit('tick', 2)).not.toThrow();
      expect(watcher.pending).toBe(0);
      watcher.shutdown();
    });

    it('ignores an emit with no waiters', () => {
      const watcher = new EventWatcher<Events>(1000);
      expect(() => watcher.onEmit('tick', 1)).not.toThrow();
      expect(watcher.pending).toBe(0);
      watcher.shutdown();
    });
  });

  describe('timeouts', () => {
    it('rejects with the event name and the elapsed budget', async () => {
      const watcher = new EventWatcher<Events>(25);
      const pending = watcher.watch('ready');

      await expect(pending).rejects.toThrow("Event 'ready' timed out after 25ms");
      watcher.shutdown();
    });

    it('honours a per-call timeout over the constructor default', async () => {
      const watcher = new EventWatcher<Events>(60_000);

      await expect(watcher.watch('ready', 20)).rejects.toThrow(/timed out after 20ms/);
      watcher.shutdown();
    });

    it('drops the event key once its last waiter times out', async () => {
      const watcher = new EventWatcher<Events>(20);
      await expect(watcher.watch('ready', 20)).rejects.toThrow();
      await expect(watcher.watch('ready', 20)).rejects.toThrow();

      expect(watcher.pending).toBe(0);
      watcher.shutdown();
    });

    it('keeps siblings when one waiter times out', async () => {
      const watcher = new EventWatcher<Events>(20);
      const doomed = watcher.watch('ready', 20);
      const survivor = watcher.watch('ready', 1000);

      await expect(doomed).rejects.toThrow();
      expect(watcher.pending).toBe(1);

      watcher.onEmit('ready', { id: 'late' });
      expect(await survivor).toEqual({ id: 'late' });
      watcher.shutdown();
    });
  });

  describe('shutdown', () => {
    /**
     * Captures a watcher's outcome without ever leaving a rejection unhandled.
     *
     * `shutdown()` rejects synchronously, so a handler has to be attached in the
     * same tick as the `watch()` call — attaching one after the rejection would
     * itself be reported as an unhandled rejection.
     */
    function capture(promise: Promise<unknown>): Promise<{ ok: boolean; value: unknown; error?: unknown }> {
      return promise.then(
        (value) => ({ ok: true, value }),
        (error: unknown) => ({ ok: false, value: undefined, error }),
      );
    }

    it('rejects every pending watcher', async () => {
      const watcher = new EventWatcher<Events>(60_000);
      const ready = capture(watcher.watch('ready'));
      const tick = capture(watcher.watch('tick'));

      watcher.shutdown();

      const readyOutcome = await ready;
      expect(readyOutcome.error).toBeInstanceOf(Error);
      expect((readyOutcome.error as Error).message).toBe("Watcher shutdown before 'ready' was emitted");
      expect(((await tick).error as Error).message).toBe("Watcher shutdown before 'tick' was emitted");
    });

    it('leaves nothing pending, so no timer outlives it', async () => {
      const watcher = new EventWatcher<Events>(60_000);
      const pending = [capture(watcher.watch('ready')), capture(watcher.watch('ready')), capture(watcher.watch('tick'))];
      expect(watcher.pending).toBe(3);

      watcher.shutdown();

      expect(watcher.pending).toBe(0);
      expect((await Promise.all(pending)).every((outcome) => !outcome.ok)).toBe(true);
    });

    it('is idempotent', async () => {
      const watcher = new EventWatcher<Events>(60_000);
      const pending = capture(watcher.watch('ready'));

      watcher.shutdown();
      expect(() => watcher.shutdown()).not.toThrow();
      expect(watcher.pending).toBe(0);

      // Still rejected exactly once — a second shutdown must not re-reject or throw.
      expect((await pending).ok).toBe(false);
    });

    it('accepts new watchers after shutdown', async () => {
      const watcher = new EventWatcher<Events>(1000);
      watcher.shutdown();

      const pending = watcher.watch('tick');
      watcher.onEmit('tick', 7);

      expect(await pending).toBe(7);
      watcher.shutdown();
    });
  });
});
