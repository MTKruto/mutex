import { Semaphore } from "./semaphore.ts";

export interface MutexInterface {
  acquire(): Promise<MutexInterface.Releaser>;

  runExclusive<T>(callback: MutexInterface.Worker<T>): Promise<T>;

  waitForUnlock(): Promise<void>;

  isLocked(): boolean;

  release(): void;

  cancel(): void;
}

export declare namespace MutexInterface {
  interface Releaser {
    (): void;
  }

  interface Worker<T> {
    (): Promise<T> | T;
  }
}

export class Mutex implements MutexInterface {
  constructor(cancelError?: Error) {
    this._semaphore = new Semaphore(1, cancelError);
  }

  async acquire(): Promise<MutexInterface.Releaser> {
    const [, releaser] = await this._semaphore.acquire();

    return releaser;
  }

  runExclusive<T>(callback: MutexInterface.Worker<T>): Promise<T> {
    return this._semaphore.runExclusive(() => callback());
  }

  isLocked(): boolean {
    return this._semaphore.isLocked();
  }

  waitForUnlock(): Promise<void> {
    return this._semaphore.waitForUnlock();
  }

  release(): void {
    if (this._semaphore.isLocked()) this._semaphore.release();
  }

  cancel(): void {
    return this._semaphore.cancel();
  }

  private _semaphore: Semaphore;
}
