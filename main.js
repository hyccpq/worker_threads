const buffer = new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT);
const myList = new Int32Array(buffer);
const { Worker } = require('worker_threads');

myList[0] = 1;

for(let i = 0; i < 3; i++) {
  const worker = new Worker(`./worker${i+1}.js`);
  worker.postMessage({buffer, num: i});
  worker.on('message', (msg) => {
    console.log(`主线程打印`, `线程${msg}退出`, myList[0]);
  })
  worker.on('exit', () => console.log(`主线程打印`, `线程退出`, myList[0]))
}