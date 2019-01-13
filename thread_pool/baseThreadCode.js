const { Actions } = require('./action')
const { parentPort } = require('worker_threads');
const { serialize, deserialize } = require('surrial');

parentPort.on('message', ({ action, payload: { port, runnable, data, rawData } }) => {
  if (action === Actions.RUN) {
    try {
      const hydratedData = data && (data instanceof SharedArrayBuffer ? data : Object.assign(deserialize(data), rawData));
      deserialize(runnable)(hydratedData).then((result) => {
        port.postMessage({
          action: Actions.RESULT, 
          payload: { result: serialize(result) } });
      })
    } catch (e) {
      port.postMessage({ action: Actions.ERROR, payload: { result: serialize(e), msg: e.message, error: true } });
    }
  }
});