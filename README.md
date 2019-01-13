# NodeJs的多线程

> 好长时间没有写博客了，借口工作比较忙！实际上还是懒，近期收货不小，待有空慢慢给大家分享。

众所周知的JavaScript一直都是单线程的玩意，尽管他的异步io使得他的单线程时候能够保证他的高效，但是在大量数据的处理上会显得极为力不从心。
往后在web平台为了解决这种问题，html5提供了webworker的api的解决方案。不过这种方式并不是真正意义上的多线程，更像是一种多进程的解决方案，因为他的各个实例中的内存是不能共享的，事件回调的通信方式也会产生一定的开销。再后来又有了类型数组，更接近原生数组的形式来让js更加直接的访问内存从而达到共享数据的目的；原子操作，来解决多线程访问同一内存的同步问题。
web端实现以上内容以及有很长一段时间了，由于兼容性问题以及安全问题等...大量数据处理，很少会放在web前端的，都是去交由后端java，go等高性能的语言去处理（当然啦，SW暂且不提）。说到这里好像多线程目前对于web来说用处目前好像不是特别大。但是别忘了还有nodeJs可以做后台，多线程对于node来说意义是巨大的。能稍弥补node在cpu密集型上效率不足的问题。
对于node开发者而言，盼星星盼月亮，终于在6月底等来了node多线程原生的实现(10.0.5+)。在node中的用法基本上和在web上的用法一致，独立线程对应各自独立文件，为更易于后台开发者使用，增加了更多的api。由于目前是实验性的模块需要在运行的时候增加`--experimental-worker`的flag，当然啦，这直接写入`package.json`也更方便使用吧。这些新增api和简单的使用方式，文档上都能查看到，这里就不过多的说明了。

## Node多线程的线程同步问题

线程同步一直以来都是在多线程应用时候比较麻烦的问题，为了各自线程安全，各种语言有着不同的实现(顺便吐槽一句，cpy的GIL使得它的多线程是真的是蛋疼)。Node的多线程的实现由于它每个线程作为独立的实例，自然内存共享就不能像其他语言那样通过同一作用域来进行共享。

### 线程数据共享

es2017新增的TypedArray以及SharedArrayBuffer给我们带来了解决办法。大致方案是通过SharedArrayBuffer先创建一块可共享内存，TypedArray创建更加底层的数组直接放入到内存中，然后通过回调的方式把内存地址传递到各个线程中去，这样就能够做到个线程在任意时刻只要建立了视图都能对那一块分享的数据进行访问。大概用法类似于这样：

```javascript
// index.js
const buffer = new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT);
const myList = new Int32Array(buffer);
const { Worker } = require('worker_threads');

myList[0] = 1;

for(let i = 0; i < 3; i++) {
  const worker = new Worker('./worker.js');
  worker.postMessage({buffer, num: i+1});
  worker.on('exit', () => console.log(`主线程打印 线程退出`, myList[0]))
}
```

```javascript
// worker.js
const { parentPort } = require('worker_threads');
const { sleep } = require('./tool');

parentPort.on('message', async ({buffer, num}) => {
  const myList = new Int32Array(buffer);
  await sleep(1000 * Math.random());
  myList[0] = myList[0] + 5;
  console.log(`第${num}线程计算得到`, myList[0]);
  parentPort.close();
})
```

打印的结果当然就为（当然这里为了模拟真实情况，所以设定了一个随机定时器，每次运行打印可能不同）

```bash
$ node --experimental-worker ./index.js
第2线程计算得到 6
主线程打印 线程退出 6
第3线程计算得到 11
主线程打印 线程退出 11
第1线程计算得到 16
主线程打印 线程退出 16
```

由于目的是直接操作内存进而实现内存共享的效果，操作这类二进制数组的时候，就得手动分配内存大小。上面的`1 * Int32Array.BYTES_PER_ELEMENT` 就是分配的内存大小，每一种TypeArray都有一个`BYTES_PER_ELEMENT` 属性，指的是一个这种数据类型占用的字节数。`buffer` 就是建立好的共享内存区域，创建3个子进程，将共享的区域传入，用接受到的区域地址实例化与前面相同类型的数组，便可以得到操作这块内存上的内容。

### 线程间同步

Atomics同样这也是es2017新增的，也就是原子操作，能够保证在同一时间只有一个线程在对共享内存进行改写。这就确保了线程安全，Atomics提供了很多静态方法，其中wait通过通过判定原内存某值是否改变来确定是否进行等待，notify则对等待的线程进行唤醒（weak方法被notify替代，node官方也不建议使用weak）。

这个时候如果我们想要做到控制一个流程的顺序执行，比如必须先保证线程1执行后，线程2执行，然后再是3，以上面这个例子为例，我们稍作一点修改。

```javascript
// index.js
const myList = new Int32Array(buffer);
const { Worker } = require('worker_threads');

myList[0] = 1;

for(let i = 0; i < 3; i++) {
  const worker = new Worker(`./worker${i+1}.js`);
  worker.postMessage({buffer, num: i+1});
  worker.on('exit', () => console.log(`主线程打印`, `线程退出`, myList[0]))
}
```

由于要对独立的子线程进行一些改动，主线程改为对不同的线程文件进行实例。对应每个工作线程如下：

```javascript
// worker1.js
const { parentPort } = require('worker_threads');
const { sleep } = require('./tool');

parentPort.on('message', async ({buffer, num}) => {
  const myList = new Int32Array(buffer);
  await sleep(1000 * Math.random()); 
  Atomics.add(myList, 0, 5); // 进行原子运算操作
  console.log(`第${num}线程计算得到`, Atomics.load(myList, 0));
  Atomics.notify(myList, 0, 2); // 通知等待的线程唤醒，最后一个值是唤醒几个线程
  parentPort.close();
})
```

```javascript
// worker2.js
const { parentPort } = require('worker_threads');
const { sleep } = require('./tool');

parentPort.on('message', async ({buffer, num}) => {
  const myList = new Int32Array(buffer);
  Atomics.wait(myList, 0, Atomics.load(myList, 0)); // 收到唤醒通知，且在结果与第三个值不相同时候唤醒。
  await sleep(1000 * Math.random());
  Atomics.add(myList, 0, 5);
  console.log(`第${num}线程计算得到`, Atomics.load(myList, 0));
  Atomics.notify(myList, 0, 1);
  parentPort.close();
})
```

```javascript
// worker3.js
const { parentPort } = require('worker_threads');
const {sleep} = require('./tool');

parentPort.on('message', async ({buffer, num}) => {
  const myList = new Int32Array(buffer);
  Atomics.wait(myList, 0, Atomics.load(myList, 0));
  Atomics.wait(myList, 0, Atomics.load(myList, 0));
  await sleep(1000 * Math.random());
  Atomics.add(myList, 0, 5);
  console.log(`第${num}线程计算得到`, Atomics.load(myList, 0));
  parentPort.close();
})
```

要满足线程1，线程2，线程3顺序执行，首先需要将线程2以及线程3在运行时进入等待状态。1执行后，唤醒等待中的二者，然后需要让线程3再次进入等待，等待线程2的完成通知。这么一做其实感觉还是挺容易的，打印结果自然就为：

```bash
$ node --experimental-worker ./main.js
第0线程计算得到 6
主线程打印 线程退出 6
第1线程计算得到 11
主线程打印 线程退出 11
第2线程计算得到 16
主线程打印 线程退出 16
✨  Done in 2.45s.
```

这就可以实现了顺序执行的问题，然而这就结束了？？

......

其实细心的看看还是会发现其中还有些问题的。

### 问题的暴露

当我写完上面代码并且执行的时候，我感觉目的已经达成。但是细细一想，万一定时器的时间足够小呢？（当然啦JavaScript里面的定时器即使你为0的时候，也会有一个最小的4ms的延时。只不过这里定时器只是模拟数据处理时候的情况吧，万一真的够小到达忽略不计的程度的时候）

这里为了复现这个问题，就把定时器也就是每个线程里面的`await sleep(1000 * Math.random())` 删了。这时候，再次运行，问题产生了，会打印第一个线程的结果并且第一个线程退出，然后就卡住了...

```bash
$ node --experimental-worker ./main.js
第0线程计算得到 6
主线程打印 线程退出 6

```

这问题仔细看下线程1里面的代码，就会发现，在执行的时候，因为1是先启动的，在线程2和3都还没开始启动的时候已经飞速的完成了原子操作，由于2，3均未来得及启动，线程1的就没有通知到后面两个线程，当后两个线程启动的时候就会一直陷入等待的状态。这个问题也就是在多线程里面比较经典的问题——"线程饥饿"。（这里1虽然通知了，但是没通知到，也就等于资源并没有释放，2，3均拿不到资源）

解决这个问题最简单的方式，就是改变启动顺序。把循环反过来跑，这样线程3和2就会在1之前启动，并且进入等待状态，待1完成后，2和3也能够接受到通知。这样这个程序就正常执行了。

多线程的应用中死锁，活锁，饥饿这些问题都还是必须得尽可能的去避免。除了这些以外，很容易踩到各种坑...

多线程实则是种很危险的方式，但是，在一些计算效率的提升上还是不得不去使用的。

当然啦，就目前而言，用js做多线程开发不是很明智的一种举措。第一点是由于它内部多线程机制还不够完善，使用起来，还是很麻烦的‘；第二就是随着现在web端wasm的发展，node端N-api提供了统一的c++接口，用其他语言会更加能避免一些问题，效率还能更高；第三点（这个也可能是个不是问题的问题，别介意），可能我又要吐槽一下这语言了，连数据类型都不全，甚至数字类型里面就只有64位双精度浮点数（也别和我提那个bigInt）。

写这篇文章的目的，也就是尝尝鲜罢了，以及最近参考的文档和书籍的笔记整理。有问题欢迎指正。

下一次，估计就在这两周左右吧（其实还是偷懒），我会用node提供的多线程方式来实现一个线程池！那咱们下次再见啦！

## 参考文献

《ES6标准入门》阮一峰

Node官方文档




