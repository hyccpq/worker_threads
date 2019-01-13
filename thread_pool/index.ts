import {
  MessageChannel,
  parentPort,
  Worker,
  WorkerOptions
} from "worker_threads";
import { Actions } from './action'
import * as ThreadWorker from './types'
import { deserialize, serialize } from "surrial";


export type Runnable<T, D> = (data?: D) => Promise<T>;

interface SubmittedThread<T, D> {
  fn: Runnable<T, D>;
  data: D;
  resolve: (result: T) => void;
  reject: (err: Error) => void;
}
export interface ThreadPool {
  submit: <T, D>(fn: Runnable<T, D>, data?: D) => Promise<T>;
}

class Executors {
  static newFixedThreadPool = (numThreads: number): ThreadPool => new FixedThreadPool(numThreads)
 
}

class FixedThreadPool implements ThreadPool {
  private freeWorkers: Worker[] = [];
  private queue: SubmittedThread<any, any>[] = [];

  constructor(
    private numThreads: number,
    private workerOptions: WorkerOptions = {}
  ) {
    this.freeWorkers = Array.from(Array(numThreads).keys()).map(
      () =>
        new Worker('./threadCode.js', {
          ...workerOptions,
          eval: true
        })
    );
  }

  public submit = <T, D>(
    fn: Runnable<T, D>,
    data?: D
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, data, resolve, reject });
      this.executeNext();
    });
  };

  private createRunAction = (payload: any): ThreadWorker.IRunAction => ({
    action: Actions.RUN,
    payload
  })

  private executeNext = (): any => {
    if (this.queue.length > 0 && this.freeWorkers.length > 0) {
      const { fn, data, resolve, reject } = this.queue.shift()!;
      const worker = this.freeWorkers.shift()!;
      const rawData: any = {};

      if (typeof data === "object") {
        Object.entries(data).forEach(([key, value]) => {
          if (value instanceof SharedArrayBuffer) {
            rawData[key] = value;
            delete data.key;
          }
        });
      }

      const channel = new MessageChannel();
      channel.port2.on(
        "message",
        ({ action, payload: { result, msg } }: ThreadWorker.IResultAction) => {
          if (action === Actions.RESULT) {
            this.freeWorkers.push(worker);
            this.executeNext();
            resolve(deserialize(result));
          } else if (action === Actions.ERROR) {
            this.freeWorkers.push(worker);
            this.executeNext();
            const e = deserialize(result);
            e.message = msg;
            reject(e);
          }
        }
      );

      worker.postMessage(
        this.createRunAction({
          data:
            data instanceof SharedArrayBuffer || !data
              ? data
              : serialize(data) || {},
          port: channel.port1,
          rawData,
          runnable: serialize(fn)
        }),
        [channel.port1]
      );
    }
  };
}