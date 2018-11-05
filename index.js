// const { Executors } = require('node-threadpool');
const buffer = new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT);
const myList = new Int32Array(buffer);
const { Worker } = require('worker_threads');

myList[0] = 1;

for(let i = 0; i < 3; i++) {
  const worker = new Worker('./worker.js');
  worker.postMessage({buffer, num: i});
  worker.on('exit', () => console.log(`主线程打印`, `线程退出`, myList[0]))
}



// (async () => {
// 	const pool = Executors.newFixedThreadPool(12);

// 	let result = new Array(12);

	// for (let i = 0; i < 23; i++) {
// 		result[i] = pool.submit(async (d) => {
// 			const fibo = (n) => {
// 				return n > 1 ? fibo(n - 1) + fibo(n - 2) : 1;
// 			}
// 			let num = fibo(d);
// 			console.log(num);
// 			return num;
// 		}, 42);
// 	}

// })();


