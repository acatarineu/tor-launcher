(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.CliqzGlobal = global.CliqzGlobal || {})));
}(this, (function (exports) { 'use strict';

/* eslint-disable no-bitwise */
/* eslint-disable no-param-reassign */
/* eslint-disable no-plusplus */
/* eslint-disable no-sparse-arrays */

function toByteArray(data) {
  if (data.buffer) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function _toString(data) {
  const CHUNK_SIZE = 32767;
  const c = [];
  const len = data.length;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    c.push(String.fromCharCode.apply(null, data.subarray(i, i + CHUNK_SIZE)));
  }
  return c.join('');
}

function _fromString(data) {
  const res = new Uint8Array(data.length);
  const len = data.length;
  for (let i = 0; i < len; i += 1) {
    res[i] = data.charCodeAt(i);
  }
  return res;
}

// http://ecmanaut.blogspot.de/2006/07/encoding-decoding-utf8-in-javascript.html
function _toUTF8(s) {
  return _fromString(unescape(encodeURIComponent(s)));
}

function _fromUTF8(s) {
  return decodeURIComponent(escape(_toString(s)));
}

/* Returns a string given a Uint8Array UTF-8 encoding */
const decoder = TextDecoder ? new TextDecoder() : { decode: _fromUTF8 };
function fromUTF8(bytes) {
  return decoder.decode(toByteArray(bytes));
}

/* Returns a Uint8Array UTF-8 encoding of the given string */
const encoder = TextEncoder ? new TextEncoder() : { encode: _toUTF8 };
function toUTF8(str) {
  return encoder.encode(str);
}

/* eslint-disable no-bitwise */

/**
 * @class DynamicDataView
 *
 * This abstraction allows to serialize efficiently low-level values of types:
 * String, uint8, uint16, uint32 while hiding the complexity of managing the
 * current offset and growing. If initialized with a big enough `length`, it
 * might also not require any resize (thus enabling serializationg with a single
 * memory allocation).
 *
 * This class is also more efficient than the built-in `DataView`.
 *
 * The way this is used in practice is that you write pairs of function to
 * serialize (respectively) deserialize a given structure/class (with code being
 * pretty symetrical). In the serializer you `pushX` values, and in the
 * deserializer you use `getX` functions to get back the values.
 */
class DynamicDataView {
  constructor(length) {
    this.buffer = new Uint8Array(length);
    this.pos = 0;
  }

  seek() {
    let pos = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

    this.pos = pos;
  }

  crop() {
    return this.buffer.subarray(0, this.pos);
  }

  set(buffer) {
    this.buffer = new Uint8Array(buffer);
    this.seek(0);
  }

  pushBytes(bytes) {
    this.checkShouldResize(bytes.byteLength);
    this.buffer.set(bytes, this.pos);
    this.pos += bytes.byteLength;
  }

  pushByte(octet) {
    this.pushUint8(octet);
  }

  pushUint8(uint8) {
    this.checkShouldResize(1);
    this.buffer[this.pos] = uint8;
    this.pos += 1;
  }

  pushUint16(uint16) {
    this.checkShouldResize(2);
    this.buffer[this.pos] = uint16 >>> 8;
    this.buffer[this.pos + 1] = uint16;
    this.pos += 2;
  }

  pushUint32(uint32) {
    this.checkShouldResize(4);
    this.buffer[this.pos] = uint32 >>> 24;
    this.buffer[this.pos + 1] = uint32 >>> 16;
    this.buffer[this.pos + 2] = uint32 >>> 8;
    this.buffer[this.pos + 3] = uint32;
    this.pos += 4;
  }

  pushUTF8(str) {
    const buffer = toUTF8(str);
    this.pushUint16(buffer.byteLength);
    this.pushBytes(buffer);
  }

  /**
   * This method is very optimistic and will assume that by default every string
   * is ascii only, but fallback to a slower utf-8 method if a non-ascii char is
   * encountered in the process of pushing the string.
   *
   * WARNING: Currently only strings of size <= 65k can be stored.
   */
  pushStr(str) {
    // Keep track of original position to be able to fallback
    // to pushUTF8 if we encounter non-ascii characters.
    const originalPos = this.pos;
    let foundUnicode = false;

    this.checkShouldResize(2 + str.length);
    this.pushUint16(str.length);

    const offset = this.pos;
    const buffer = this.buffer;
    for (let i = 0; i < str.length && !foundUnicode; i += 1) {
      const ch = str.charCodeAt(i);
      buffer[offset + i] = ch;
      foundUnicode = foundUnicode || ch > 127;
    }

    if (foundUnicode) {
      // Fallback to a slower utf-8 text encoder
      this.pos = originalPos;
      this.pushUTF8(str);
    } else {
      this.pos += str.length;
    }
  }

  // Read next value

  getBytes(n) {
    const bytes = this.buffer.subarray(this.pos, this.pos + n);
    this.pos += n;
    return bytes;
  }

  getByte() {
    return this.getUint8();
  }

  getUint8() {
    const uint8 = this.buffer[this.pos];
    this.pos += 1;
    return uint8;
  }

  getUint16() {
    const uint16 = (this.buffer[this.pos] << 8 | this.buffer[this.pos + 1]) >>> 0;
    this.pos += 2;
    return uint16;
  }

  getUint32() {
    const uint32 = (this.buffer[this.pos] << 24 >>> 0) + (this.buffer[this.pos + 1] << 16 | this.buffer[this.pos + 2] << 8 | this.buffer[this.pos + 3]) >>> 0;
    this.pos += 4;
    return uint32;
  }

  getUTF8() {
    return fromUTF8(this.getBytes(this.getUint16()));
  }

  getStr() {
    // Keep track of original position to be able to fallback
    // to getUTF8 if we encounter non-ascii characters.
    const originalPos = this.pos;
    const size = this.getUint16();

    // Check if there is a non-ascii character in the string.
    let i = 0;
    for (; i < size && this.buffer[this.pos + i] <= 127; i += 1) {
      /* empty */
    }

    if (i < size) {
      this.pos = originalPos;
      return this.getUTF8();
    }

    return String.fromCharCode.apply(null, this.getBytes(size));
  }

  checkShouldResize(n) {
    if (this.pos + n >= this.buffer.byteLength) {
      this.resize(n);
    }
  }

  resize() {
    let n = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

    const newBuffer = new Uint8Array(Math.floor((this.pos + n) * 1.5));
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
  }
}
/* eslint-enable no-bitwise */

const OP_RUN = 0;
const OP_SOCKET = 1;
const OP_SEND = 2;
const OP_CLOSE = 3;
const OP_OPEN = 4;
const OP_SERVER = 5;

class TorManager {
  constructor(worker) {
    this.worker = worker;
    this.view = new DynamicDataView(0);
    this.onrun = () => {};
    this.onsocket = () => {};
    this.onsend = () => {};
    this.onclose = () => {};
    this.onopen = () => {};
    this.onserver = () => {};
    this.worker.onmessage = this.processMessage.bind(this);
  }

  unload() {
    delete this.worker;
    delete this.view;
    this.onrun = () => {};
    this.onsocket = () => {};
    this.onsend = () => {};
    this.onclose = () => {};
    this.onopen = () => {};
    this.onserver = () => {};
  }

  processMessage(e) {
    const buffer = toByteArray(e.data);
    const len = buffer.length;

    const view = this.view;
    view.buffer = buffer; // FIXME hack
    view.seek(0);

    const id = view.getUint32();
    const op = view.getByte();
    switch (op) {
      case OP_RUN:
        // run
        this.onrun(id, JSON.parse(view.getStr()));
        break;
      case OP_SOCKET:
        // socket
        this.onsocket(id, view.getBytes(4).join('.'), view.getUint16());
        break;
      case OP_SEND:
        // send
        this.onsend(id, view.getBytes(len - 1 - 4).slice());
        break;
      case OP_CLOSE:
        // close
        this.onclose(id);
        break;
      case OP_OPEN:
        // open
        this.onopen(id);
        break;
      case OP_SERVER:
        // server
        this.onserver(view.getUint16());
        break;
      default:
        break;
    }
  }

  static makeMsg(id, op, view) {
    view.seek(0);
    view.pushUint32(id);
    view.pushByte(op);
  }

  sendRun(obj) {
    TorManager.makeMsg(0, OP_RUN, this.view);
    this.view.pushStr(JSON.stringify(obj));
    this.worker.postMessage(this.view.crop());
  }

  sendSocket(id, host, port) {
    TorManager.makeMsg(id, OP_SOCKET, this.view);
    host.split('.').map(x => parseInt(x, 10)).forEach(x => this.view.pushByte(x));
    this.view.pushUint16(port);
    this.worker.postMessage(this.view.crop());
  }

  send(id, _data) {
    const data = toByteArray(_data);
    TorManager.makeMsg(id, OP_SEND, this.view);
    this.view.pushBytes(data);
    this.worker.postMessage(this.view.crop());
  }

  sendClose(id) {
    TorManager.makeMsg(id, OP_CLOSE, this.view);
    this.worker.postMessage(this.view.crop());
  }

  sendOpen(id) {
    TorManager.makeMsg(id, OP_OPEN, this.view);
    this.worker.postMessage(this.view.crop());
  }

  sendServer(port) {
    TorManager.makeMsg(0, OP_SERVER, this.view);
    this.view.pushUint16(port);
    this.worker.postMessage(this.view.crop());
  }
}

const manager = new TorManager(self);

importScripts('tor.js');

function randID() {
  return Math.floor(Math.random() * 4294967296);
}

const sockets = {};

class FakeLocalSocket {
  static get CONNECTING() {
    return 0;
  }
  static get OPEN() {
    return 1;
  }
  static get CLOSING() {
    return 2;
  }
  static get CLOSED() {
    return 3;
  }

  constructor(id, remoteAddress, remotePort) {
    // Seems that WebSockets have these both in prototype and as 'static' properties.
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;

    this.id = id;
    sockets[this.id] = this;
    this.readyState = FakeLocalSocket.OPEN;
    this._socket = {
      remoteAddress,
      remotePort
    };
  }

  send(data) {
    manager.send(this.id, data);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    delete sockets[this.id];
    this.readyState = FakeLocalSocket.CLOSED;
    manager.sendClose(this.id);
  }
}

class FakeRemoteSocket {
  static get CONNECTING() {
    return 0;
  }
  static get OPEN() {
    return 1;
  }
  static get CLOSING() {
    return 2;
  }
  static get CLOSED() {
    return 3;
  }

  constructor(url, protocols) {
    // Seems that WebSockets have these both in prototype and as 'static' properties.
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;

    if (url.indexOf('ws://') === 0 && protocols[0] === 'binary') {
      const sp = (url.slice(5).split('/')[0] || '').split(':');
      this.host = sp[0];
      this.port = parseInt(sp[1], 10);
    }

    if (!this.host || !Number.isInteger(this.port)) {
      throw new Error('Invalid host or port for socket');
    }

    this.id = randID();
    sockets[this.id] = this;
    this.readyState = FakeRemoteSocket.CONNECTING;
    manager.sendSocket(this.id, this.host, this.port);
  }

  send(data) {
    manager.send(this.id, data);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    delete sockets[this.id];
    this.readyState = FakeRemoteSocket.CLOSED;
    manager.sendClose(this.id);
    if (this.onclose) {
      this.onclose();
    }
  }
}

// FakeSocketServer

// local listening servers, indexed by port
// by default it will just be one server listening to 9050
const servers = {};

class FakeSocketServer {
  constructor(config) {
    if (!config || config.host !== '127.0.0.1' || typeof config.port !== 'number' || servers[config.port]) {
      throw new Error(`Wrong listening server ${config && config.port}`);
    }
    this.config = config;
    this.listeners = {};
    servers[config.port] = this;
    manager.sendServer(config.port);
  }

  on(name, cb) {
    this.listeners[name] = cb;
  }

  connection(ws) {
    if (this.listeners.connection) {
      manager.sendOpen(ws.id);
      this.listeners.connection(ws);
    } else {
      ws.close();
    }
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    Object.keys(this.sockets).forEach(x => {
      try {
        this.sockets[x].close();
      } catch (e) {
        // pass
      }
    });
    delete this.sockets;
    delete this.listeners;
    if (servers[this.config.port] === this) {
      delete servers[this.config.port];
    }
    delete this.config;
  }
}

let socketCount = 0;

manager.onrun = (id, data) => {
  const instance = self.Module({
    CustomSocketServer: FakeSocketServer,
    CustomSocket: FakeRemoteSocket,
    arguments: data.args
  });

  if (data.silent) {
    instance.print = () => {};
  }
  if (data.noErrors) {
    instance.printErr = () => {};
  }

  function persist() {
    instance.persist().then(() => {
      setTimeout(persist, 60 * 1000);
    });
  }
  setTimeout(persist, 30 * 1000);
};

manager.onsocket = (id, host, port) => {
  const serverPort = port;
  const ip = host;
  // let's try to preserve linux behaviour
  // FIXME: assuming collisions are very unlikely, should we check?
  const localPort = 32768 + socketCount;
  if (port > 61000) {
    socketCount = 0;
  }
  const server = servers[serverPort];
  const ws = new FakeLocalSocket(id, ip, localPort);
  if (server) {
    server.connection(ws);
  } else {
    ws.close();
  }
};

manager.onsend = (id, data) => {
  const socket = sockets[id];
  if (socket) {
    socket.onmessage({ data });
  }
};

manager.onclose = id => {
  const socket = sockets[id];
  if (socket) {
    socket.close();
  }
};

manager.onopen = id => {
  const socket = sockets[id];
  if (socket) {
    socket.readyState = FakeRemoteSocket.OPEN;
    if (socket.onopen) {
      socket.onopen();
    }
  }
};

Object.defineProperty(exports, '__esModule', { value: true });

})));
