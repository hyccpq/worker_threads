const { parentPort } = require('worker_threads');
const { sleep } = require('./tool');

parentPort.on('message', async ({buffer, num}) => {
  const myList = new Int32Array(buffer);
  await sleep(1000 * Math.random());
  myList[0] = myList[0] + 5;
  console.log(`第${num}线程计算得到`, myList[0]);
  parentPort.close();
})