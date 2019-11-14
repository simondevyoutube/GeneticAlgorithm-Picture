export const render = (function() {

  let _IDs = 0;

  class PWorker {
    constructor(s) {
      this._worker = new Worker(s);
      this._worker.onmessage = (e) => {
        this._OnMessage(e);
      };
      this._resolve = null;
      this._id = _IDs++;
    }

    _OnMessage(e) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(e.data);
    }

    get id() {
      return this._id;
    }

    sendAsync(s) {
      return new Promise((resolve) => {
        this._resolve = resolve;
        this._worker.postMessage(s);
      });
    }
  }

  class PWorkerPool {
    constructor(sz, entry) {
      this._workers = [...Array(sz)].map(_ => new PWorker(entry));
      this._free = [...this._workers];
      this._busy = {};
      this._queue = [];
    }

    get length() {
      return this._workers.length;
    }

    Broadcast(msg) {
      return Promise.all(this._workers.map(w => w.sendAsync(msg)));
    }

    Enqueue(workItem) {
      return new Promise(resolve => {
          this._queue.push([workItem, resolve]);
          this._PumpQueue();
      });
    }

    _PumpQueue() {
      while (this._free.length > 0 && this._queue.length > 0) {
        const w = this._free.pop();
        this._busy[w.id] = w;

        const [workItem, workResolve] = this._queue.shift();

        w.sendAsync(workItem).then((v) => {
          delete this._busy[w.id];
          this._free.push(w);
          workResolve(v);
          this._PumpQueue();
        });
      }
    }
  }
  const _POOL = new PWorkerPool(
      navigator.hardwareConcurrency, 'genetic-worker.js');


  return {
    setup: function(srcData) {
      const setupMsg = {
          action: 'setup',
          srcData: srcData,
      };
      return _POOL.Broadcast(setupMsg);
    },

    draw: function(type, genotype, width, height) {
      const p = _POOL.Enqueue({
          action: 'draw',
          type: type,
          genotype: genotype,
          width: width,
          height: height
      });
      return p;
    },

    calculateFitnesses: function(type, genotypes) {
      // Wait for them all to be done
      const workItems = genotypes.map((g, i) => ({genotype: g, index: i}));

      const chunkSize = genotypes.length / _POOL.length;
      const promises = [];

      while (workItems.length > 0) {
        const workSet = workItems.splice(0, chunkSize);
        const workItem = {
          action: 'work',
          work: workSet,
          type: type,
        };
        promises.push(_POOL.Enqueue(workItem));
      }

      return promises;
    },
  };
})();
