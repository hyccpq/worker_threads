const { Executors } = require('node-threadpool');
const buffer = new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT);
const array = new Int32Array(buffer);

(async () => {
	const pool = Executors.newSingleThreadedExecutor();

	const result = pool.submit(async (d) => {
		const view = new Int32Array(d);
		console.log('2')
		Atomics.wait(view, 0, 0); // wait here until the value is no longer 0
		return Atomics.load(view, 0);
	}, buffer);

	console.log(await result); // prints 1
})();

setTimeout(() => {
	console.log('呵呵')
	Atomics.store(array, 0, 123); // change the value from 0, unblocking the worker thread
	Atomics.notify(array, 0, 1)
	// console.log(Atomics.load(array, 0))
}, 3000);
