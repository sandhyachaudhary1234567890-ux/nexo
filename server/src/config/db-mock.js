'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');
const EventEmitter = require('events');

// --- In-Memory Stores ---
const jobsStore = {}; // queueName -> Array of jobs
const workersStore = {}; // queueName -> Array of worker handlers
const dbStore = {}; // modelName -> Array of documents

// --- Mock Redis Client ---
class MockRedis extends EventEmitter {
  constructor(url, options) {
    super();
    this.store = {};
    this.status = 'ready';
    
    process.nextTick(() => {
      this.emit('connect');
      this.emit('ready');
    });
  }
  
  async get(key) {
    return this.store[key] || null;
  }
  
  async set(key, value, ...args) {
    this.store[key] = String(value);
    return 'OK';
  }
  
  async del(key) {
    const count = this.store[key] ? 1 : 0;
    delete this.store[key];
    return count;
  }
  
  async incr(key) {
    const val = parseInt(this.store[key]) || 0;
    const newVal = val + 1;
    this.store[key] = String(newVal);
    return newVal;
  }
  
  async keys(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Object.keys(this.store).filter(k => regex.test(k));
  }
}

// --- Mock BullMQ Queue ---
class MockQueue {
  constructor(name, options) {
    this.name = name;
    this.options = options;
  }
  
  get client() {
    return {
      status: 'ready',
      on: () => {},
      off: () => {},
    };
  }
  
  on(event, handler) { return this; }
  off(event, handler) { return this; }
  once(event, handler) { return this; }
  emit(event, ...args) { return true; }
  
  async add(jobName, data, options) {
    const jobId = Math.random().toString(36).substring(7);
    const job = {
      id: jobId,
      name: jobName,
      data: data || {},
      opts: options || {},
      timestamp: Date.now(),
      attemptsMade: 0,
      getState: async () => 'completed',
    };
    
    logger.info(`[MockQueue] Job ${jobId} added to '${this.name}' queue`);
    if (!jobsStore[this.name]) jobsStore[this.name] = [];
    jobsStore[this.name].push(job);
    
    process.nextTick(() => {
      triggerWorker(this.name, job);
    });
    
    return job;
  }
  
  async getJobs() { return jobsStore[this.name] || []; }
  async getJobCounts() { return { active: 0, completed: jobsStore[this.name]?.length || 0, failed: 0, delayed: 0, waiting: 0 }; }
  async clean() { return []; }
  async pause() { return; }
  async resume() { return; }
  async isPaused() { return false; }
}

// --- Mock BullMQ Worker ---
class MockWorker {
  constructor(name, handler, options) {
    this.name = name;
    this.handler = handler;
    this.options = options;
    
    if (!workersStore[name]) workersStore[name] = [];
    workersStore[name].push(this);
    
    logger.info(`[MockWorker] Started worker for '${name}' queue`);
  }
  
  on(event, callback) {
    return this;
  }
}

async function triggerWorker(queueName, job) {
  const workers = workersStore[queueName];
  if (!workers || workers.length === 0) {
    logger.debug(`[MockQueue] No workers registered for queue '${queueName}' yet. Job queued.`);
    return;
  }
  
  const worker = workers[0];
  try {
    job.attemptsMade++;
    await worker.handler(job);
    logger.info(`[MockQueue] Job ${job.id} completed successfully in '${queueName}'`);
  } catch (err) {
    logger.error(`[MockQueue] Job ${job.id} failed in '${queueName}': ${err.message}`);
  }
}

// --- Dynamic Query Matching & Mutation ---
function getCollection(modelName) {
  if (!dbStore[modelName]) dbStore[modelName] = [];
  return dbStore[modelName];
}

function matchFilter(doc, filter) {
  if (!filter) return true;
  for (const key of Object.keys(filter)) {
    let val = filter[key];
    if (key === '$or') {
      if (!Array.isArray(val)) continue;
      const matched = val.some(f => matchFilter(doc, f));
      if (!matched) return false;
      continue;
    }
    if (key === '$and') {
      if (!Array.isArray(val)) continue;
      const matched = val.every(f => matchFilter(doc, f));
      if (!matched) return false;
      continue;
    }
    
    let docVal = doc;
    if (key.includes('.')) {
      const parts = key.split('.');
      for (const p of parts) {
        docVal = docVal ? docVal[p] : undefined;
      }
    } else {
      docVal = doc[key];
    }

    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      const operators = Object.keys(val);
      for (const op of operators) {
        const opVal = val[op];
        if (op === '$in') {
          if (!Array.isArray(opVal)) return false;
          if (!opVal.includes(docVal)) return false;
        } else if (op === '$nin') {
          if (!Array.isArray(opVal)) return false;
          if (opVal.includes(docVal)) return false;
        } else if (op === '$regex') {
          const regex = new RegExp(opVal, val.$options || 'i');
          if (!regex.test(docVal || '')) return false;
        } else if (op === '$gt') {
          if (!(docVal > opVal)) return false;
        } else if (op === '$gte') {
          if (!(docVal >= opVal)) return false;
        } else if (op === '$lt') {
          if (!(docVal < opVal)) return false;
        } else if (op === '$lte') {
          if (!(docVal <= opVal)) return false;
        } else if (op === '$ne') {
          if (docVal === opVal) return false;
        }
      }
    } else {
      if (docVal !== val) return false;
    }
  }
  return true;
}

function applyUpdate(doc, update) {
  if (!update) return doc;
  for (const key of Object.keys(update)) {
    if (key === '$set') {
      for (const k of Object.keys(update.$set)) {
        setNested(doc, k, update.$set[k]);
      }
    } else if (key === '$push') {
      for (const k of Object.keys(update.$push)) {
        if (!Array.isArray(doc[k])) doc[k] = [];
        const pushVal = update.$push[k];
        if (pushVal && typeof pushVal === 'object' && pushVal.$each) {
          doc[k].push(...pushVal.$each);
        } else {
          doc[k].push(pushVal);
        }
      }
    } else if (key === '$pull') {
      for (const k of Object.keys(update.$pull)) {
        if (!Array.isArray(doc[k])) continue;
        const pullVal = update.$pull[k];
        doc[k] = doc[k].filter(item => {
          if (pullVal && typeof pullVal === 'object') {
            return !matchFilter(item, pullVal);
          }
          return item !== pullVal;
        });
      }
    } else if (key === '$inc') {
      for (const k of Object.keys(update.$inc)) {
        doc[k] = (doc[k] || 0) + update.$inc[k];
      }
    } else if (key === '$unset') {
      for (const k of Object.keys(update.$unset)) {
        delete doc[k];
      }
    } else if (!key.startsWith('$')) {
      doc[key] = update[key];
    }
  }
  doc.updatedAt = new Date();
  return doc;
}

function setNested(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function sortItems(items, sortOption) {
  if (!sortOption) return items;
  let sortField = '';
  let sortOrder = 1;
  if (typeof sortOption === 'string') {
    const parts = sortOption.trim().split(/\s+/);
    let field = parts[0];
    if (field.startsWith('-')) {
      sortField = field.substring(1);
      sortOrder = -1;
    } else {
      sortField = field;
      sortOrder = 1;
    }
  } else if (typeof sortOption === 'object') {
    const keys = Object.keys(sortOption);
    if (keys.length > 0) {
      sortField = keys[0];
      sortOrder = sortOption[sortField] === -1 || sortOption[sortField] === 'desc' ? -1 : 1;
    }
  }
  if (!sortField) return items;
  return [...items].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal === bVal) return 0;
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;
    if (aVal < bVal) return -1 * sortOrder;
    return 1 * sortOrder;
  });
}

// --- Main Enabler ---
function enable() {
  logger.info('🔌 OFFLINE MOCK MODE ACTIVATED');
  logger.info('⚠️  Running with in-memory MongoDB and Redis stubs.');

  // Override require for bullmq and ioredis
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === 'bullmq') {
      return { Queue: MockQueue, Worker: MockWorker };
    }
    if (id === 'ioredis') {
      return MockRedis;
    }
    return originalRequire.apply(this, arguments);
  };

  const mockCollection = {
    createIndex: async () => {},
    createIndexes: async () => {},
    listIndexes: () => ({ toArray: async () => [] }),
  };

  const mockDb = {
    collection: () => mockCollection,
    admin: () => ({ ping: async () => true }),
  };

  // Mock mongoose connect
  mongoose.connect = async () => {
    mongoose.connection.readyState = 1;
    mongoose.connection.db = mockDb;
    logger.info('✅ Mock MongoDB connection ready (in-memory)');
    return mongoose.connection;
  };

  // Mock connection status
  mongoose.connection.readyState = 1;
  mongoose.connection.db = mockDb;
  process.nextTick(() => {
    mongoose.connection.emit('connected');
  });

  // Mock Mongoose Query.prototype.exec
  mongoose.Query.prototype.exec = async function() {
    const modelName = this.model.modelName;
    const operation = this.op;
    const filter = this._conditions || {};
    const update = this._update;
    const options = this.options || {};
    
    logger.debug(`[MockDB] Executing ${modelName}.${operation} with filter: ${JSON.stringify(filter)}`);
    
    const collection = getCollection(modelName);
    let items = collection.filter(doc => matchFilter(doc, filter));

    if (operation === 'find') {
      items = sortItems(items, options.sort || this._sortField);
      let skipVal = options.skip || this._skipVal || 0;
      let limitVal = options.limit || this._limitVal;
      let sliced = items.slice(skipVal);
      if (limitVal !== undefined && limitVal !== null) {
        sliced = sliced.slice(0, limitVal);
      }
      return sliced.map(item => new this.model(item));
    }

    if (operation === 'findOne' || operation === 'findById') {
      const item = items[0];
      return item ? new this.model(item) : null;
    }

    if (operation === 'countDocuments' || operation === 'count') {
      return items.length;
    }

    if (operation === 'findOneAndUpdate' || operation === 'findByIdAndUpdate') {
      let item = items[0];
      if (item) {
        const oldItem = JSON.parse(JSON.stringify(item));
        applyUpdate(item, update);
        return options.new ? new this.model(item) : new this.model(oldItem);
      } else if (options.upsert) {
        const newItem = { _id: new mongoose.Types.ObjectId().toString(), createdAt: new Date() };
        Object.assign(newItem, filter);
        applyUpdate(newItem, update);
        collection.push(newItem);
        return new this.model(newItem);
      }
      return null;
    }

    if (operation === 'updateOne') {
      const item = items[0];
      if (item) {
        applyUpdate(item, update);
        return { acknowledged: true, modifiedCount: 1, matchedCount: 1 };
      }
      return { acknowledged: true, modifiedCount: 0, matchedCount: 0 };
    }

    if (operation === 'updateMany') {
      items.forEach(item => applyUpdate(item, update));
      return { acknowledged: true, modifiedCount: items.length, matchedCount: items.length };
    }

    if (operation === 'deleteOne' || operation === 'findOneAndDelete') {
      const item = items[0];
      if (item) {
        const idx = collection.indexOf(item);
        collection.splice(idx, 1);
        return operation === 'findOneAndDelete' ? new this.model(item) : { acknowledged: true, deletedCount: 1 };
      }
      return operation === 'findOneAndDelete' ? null : { acknowledged: true, deletedCount: 0 };
    }

    if (operation === 'deleteMany') {
      let deleted = 0;
      items.forEach(item => {
        const idx = collection.indexOf(item);
        if (idx >= 0) {
          collection.splice(idx, 1);
          deleted++;
        }
      });
      return { acknowledged: true, deletedCount: deleted };
    }

    logger.warn(`[MockDB] Unsupported query operation: ${operation}`);
    return [];
  };

  // Mock save of Document
  mongoose.Document.prototype.save = async function() {
    const modelName = this.constructor.modelName;
    const collection = getCollection(modelName);
    const data = this.toObject();

    if (!data._id) {
      data._id = new mongoose.Types.ObjectId().toString();
    } else {
      data._id = data._id.toString();
    }

    const idx = collection.findIndex(item => item._id.toString() === data._id);
    if (idx >= 0) {
      collection[idx] = data;
    } else {
      collection.push(data);
    }

    this._id = data._id;
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = new Date();
    
    logger.debug(`[MockDB] Saved document in ${modelName}: ${data._id}`);
    return this;
  };
}

module.exports = { enable };
