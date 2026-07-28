import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebouncedRowSaver } from './attendanceAutoSave.js';

describe('createDebouncedRowSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces multiple schedules for the same row into one save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const pending = vi.fn();
    const saver = createDebouncedRowSaver({ delayMs: 400, onSave });
    saver.onPendingChange(pending);

    saver.schedule('row-1');
    saver.schedule('row-1');
    saver.schedule('row-1');

    expect(onSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('row-1');
  });

  it('saves two rows independently', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedRowSaver({ delayMs: 200, onSave });

    saver.schedule('row-a');
    saver.schedule('row-b');
    await vi.advanceTimersByTimeAsync(200);

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenCalledWith('row-a');
    expect(onSave).toHaveBeenCalledWith('row-b');
  });
});
