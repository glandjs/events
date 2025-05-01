import { describe, it, expect } from 'bun:test';
import { EventEmitter } from '../../src/engine/event-emitter';

type Payloads = {
  test: string;
  num: number;
};

describe('EventEmitter', () => {
  it('calls a listener registered with on when emit is invoked', () => {
    const ee = new EventEmitter<Payloads>();
    let result = '';
    ee.on('test', (payload) => {
      result = payload;
    });
    ee.emit('test', 'hello');
    expect(result).toBe('hello');
  });

  it('removes a listener when off is called', () => {
    const ee = new EventEmitter<Payloads>();
    let called = false;
    const listener = () => {
      called = true;
    };
    ee.on('test', listener);
    ee.off('test', listener);
    ee.emit('test', 'world');
    expect(called).toBe(false);
  });

  it('calls a listener only once when once is used', () => {
    const ee = new EventEmitter<Payloads>();
    let count = 0;
    ee.once('test', () => {
      count++;
    });
    ee.emit('test', 'first');
    ee.emit('test', 'second');
    expect(count).toBe(1);
  });

  it('resolves a promise from watch when an event is emitted', async () => {
    const ee = new EventEmitter<Payloads>();
    const promise = ee.watch('num', 100);
    setTimeout(() => ee.emit('num', 42), 10);
    const value = await promise;
    expect(value).toBe(42);
  });

  it('rejects the watch promise on timeout without defaultValue', async () => {
    const ee = new EventEmitter<Payloads>();
    let error: any;
    try {
      await ee.watch('num', 10);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
  });

  it('returns defaultValue when watch times out and defaultValue is provided via on options', async () => {
    const ee = new EventEmitter<Payloads>();
    const defaultVal = 'fallback';
    const result = await ee.on('test', null, { watch: true, timeout: 10, defaultValue: defaultVal });
    expect(result).toBe(defaultVal);
  });

  it('emits with options.watch and resolves the returned promise', async () => {
    const ee = new EventEmitter<Payloads>();
    const promise = ee.on('test', null, { watch: true, timeout: 100 });
    ee.emit('test', 'watched', { watch: true });
    const val = await promise;
    expect(val).toBe('watched');
  });

  it('getListener returns the array of listeners for an event', () => {
    const ee = new EventEmitter<Payloads>();
    const fn = () => {};
    ee.on('test', fn);
    const list = ee.getListener('test');
    expect(list).toContain(fn);
    ee.off('test', fn);
    const empty = ee.getListener('test');
    expect(empty.length).toBe(0);
  });

  it('rejects pending watch promises after shutdown', async () => {
    const ee = new EventEmitter<Payloads>();
    const promise = ee.watch('num', 100);
    ee.shutdown();
    let error: any;
    try {
      await promise;
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
  });
});
