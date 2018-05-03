/* global Components, console */
Components.utils.importGlobalProperties(['TextEncoder', 'TextDecoder', 'btoa', 'atob', 'crypto']);

try {
  Components.utils.import('resource://gre/modules/Console.jsm');
} catch (e) {
  // Older version of Firefox
  Components.utils.import('resource://gre/modules/devtools/Console.jsm');
}

/* global window */

/* global global, Services, Components, XPCOMUtils, window */

Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');

// TODO: @remusao webrequest-pipeline/page-store require chrome


const fakeGlobal = Object.create(null);

/**
 * exporting a global object to allow access to javascript buildins like
 * Object, Symbol
 */
/* eslint-disable func-names, prefer-arrow-callback, new-cap */
const safeGlobal = new Proxy(fakeGlobal, {
  get(target, key) {
    if (fakeGlobal[key]) {
      return fakeGlobal[key];
    }

    if (typeof window !== 'undefined') {
      return window[key];
    }

    if (typeof global !== 'undefined') {
      return global[key];
    }

    return undefined;
  }
});

/* eslint no-console: 'off' */

const prefs$1 = Services.prefs.getBranch('');
const complexRegEx = /^chrome:\/\/.+\/locale\/.+\.properties/;

function prefixPref(pref) {
  let prefix = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'extensions.cliqz.';

  return `${prefix}${pref}`;
}

function getPref(key, defaultValue, prefix) {
  const pref = prefixPref(key, prefix);
  try {
    switch (prefs$1.getPrefType(pref)) {
      case 128:
        return prefs$1.getBoolPref(pref);
      case 32:
        {
          let charVal = prefs$1.getCharPref(pref);

          // it might be a complex value
          if (complexRegEx.test(charVal)) {
            try {
              charVal = prefs$1.getComplexValue(pref, Components.interfaces.nsIPrefLocalizedString).data;
            } catch (e) {
              console.log(`Error fetching pref: ${pref}`);
            }
          }

          return charVal;
        }
      case 64:
        return prefs$1.getIntPref(pref);
      default:
        return defaultValue;
    }
  } catch (e) {
    return defaultValue;
  }
}

function setPref(key, value, prefix) {
  const pref = prefixPref(key, prefix);

  switch (typeof value) {
    case 'boolean':
      prefs$1.setBoolPref(pref, value);break;
    case 'number':
      prefs$1.setIntPref(pref, value);break;
    case 'string':
      prefs$1.setCharPref(pref, value);break;
    default:
      Services.console.logStringMessage(`WARNING: Unable to save "${pref}`);break;
  }
}

function hasPref(key, prefix) {
  const pref = prefixPref(key, prefix);
  return prefs$1.getPrefType(pref) !== 0;
}

function clearPref(key, prefix) {
  const pref = prefixPref(key, prefix);
  prefs$1.clearUserPref(pref);
}

function enableChangeEvents() {}

function disableChangeEvents() {}

function init() {
  return Promise.resolve();
}

var prefs = {
  /**
   * Get a value from preferences db
   * @param {string}  pref - preference identifier
   * @param {*=}      defautlValue - returned value in case pref is not defined
   * @param {string=} prefix - prefix for pref
   */
  get: getPref,
  /**
   * Set a value in preferences db
   * @param {string}  pref - preference identifier
   * @param {string=} prefix - prefix for pref
   */
  set: setPref,
  /**
   * Check if there is a value in preferences db
   * @param {string}  pref - preference identifier
   * @param {string=} prefix - prefix for pref
   */
  has: hasPref,
  /**
   * Clear value in preferences db
   * @param {string}  pref - preference identifier
   * @param {string=} prefix - prefix for pref
   */
  clear: clearPref,

  enableChangeEvents,

  disableChangeEvents,

  /**
   * Set a value of type object in preferences db
   * @param {string}  pref - preference identifier
   */
  getObject(key) {
    return JSON.parse(this.get(key, '{}'));
  },

  /**
   * Set a value in preferences db
   * @param {string}  pref - preference identifier
   * @param {object|function}
   */
  setObject(key, value) {
    if (value instanceof Function) {
      const prevValue = this.getObject(key);
      const newValue = value(prevValue);
      this.setObject(key, newValue);
    } else if (typeof value === 'object') {
      this.set(key, JSON.stringify(value));
    } else {
      throw new TypeError();
    }
  },

  init

};

// detect dev flag on react-native
const devMode = typeof global !== 'undefined' && global.__DEV__ === true;
// either take flag from prefs, or global dev mode flag
// We need to put a try, catch, to avoid content-scripts throwing error,
// while trying to get the prefs.
// Should look for a cleaner solutions at some point. for isLoggingEnabled, isDeveloper.

function isLoggingEnabled() {
  try {
    return prefs.get('showConsoleLogs', devMode || false);
  } catch (ee) {
    return false;
  }
}

function isDeveloper() {
  try {
    return prefs.get('developer', devMode || false);
  } catch (ee) {
    return false;
  }
}

let log;
let error$1;
let debug;
let warn;

if (isLoggingEnabled()) {
  log = console.log.bind(console, 'Cliqz');
  error$1 = console.error.bind(console, 'Cliqz error');
  warn = console.warn.bind(console, 'Cliqz warning');
  if (isDeveloper()) {
    debug = log;
  } else {
    debug = () => {};
  }
} else {
  log = () => {};
  error$1 = () => {};
  debug = () => {};
  warn = () => {};
}

var console$1 = {
  log,
  error: error$1,
  debug,
  warn
};

/**
 * No-op function.
 */
function noop() {}

function multiArgsDump() {
  if (arguments.length > 0) {
    dump(arguments.length <= 0 ? undefined : arguments[0]);

    for (let i = 1; i < arguments.length; i += 1) {
      dump(' ');
      dump(arguments.length <= i ? undefined : arguments[i]);
    }

    dump('\n');
  }
}

function Logger(options) {
  const useDump = options.useDump === true;
  const level = options.level || 'log';
  const prefix = options.prefix;

  let debug = console$1.debug;
  let log = console$1.log;
  let error = console$1.error;

  if (useDump) {
    debug = multiArgsDump.bind(null, '[DEBUG]');
    log = multiArgsDump.bind(null, '[LOG]');
    error = multiArgsDump.bind(null, '[ERROR]');
  }

  if (prefix) {
    debug = debug.bind(null, prefix);
    log = log.bind(null, prefix);
    error = error.bind(null, prefix);
  }

  if (level === 'log') {
    debug = noop;
  }

  if (level === 'error') {
    debug = noop;
    log = noop;
  }

  return {
    debug,
    log,
    error
  };
}

var logger = Logger({
  useDump: false,
  level: 'log',
  prefix: '[proxyPeer]'
});

/* global crypto */

/* eslint-disable no-bitwise */

// Cryptographically secure Math.random replacement
//
//  Doing the same as Firefox Math.random does, but with a crypto secure 64 bit number instead.
//  The equivalent in C++ is: double(uint64val & 0x1FFFFFFFFFFFFF) / (1 << 53);
//  WARNING: In tests (Linux), considerably slower than Math.random (5-10 times)
function random() {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return (Math.pow(2, 32) * (values[0] & 0x1FFFFF) + values[1]) / Math.pow(2, 53);
}

function randomInt() {
  return Math.floor(random() * Number.MAX_SAFE_INTEGER);
}

const Ci$1 = Components.interfaces;


let MAIN_THREAD = null;
let TRANSPORT_SERVICE = null;
let OK_RESULT = null;
try {
  MAIN_THREAD = Components.classes['@mozilla.org/thread-manager;1'].getService(Components.interfaces.nsIThreadManager).mainThread;
  TRANSPORT_SERVICE = Components.classes['@mozilla.org/network/socket-transport-service;1'].getService(Components.interfaces.nsISocketTransportService);
  OK_RESULT = Components.results.NS_OK;
} catch (ex) {
  logger.error(`TCP MAIN_THREAD ERROR ${ex}`);
}

// Uniq IDs generator
function getRandomID() {
  return randomInt();
}

/* Reads all available data from the given input stream.
 *
 * @param {nsIBinaryInputStream} inputStream The stream to read from.
 */
function readBytes(binaryStream) {
  const bytesAvailable = binaryStream.available();
  const lineData = binaryStream.readByteArray(bytesAvailable);
  const buffer = new ArrayBuffer(lineData.length);
  const typedBuffer = new Uint8Array(buffer);
  typedBuffer.set(lineData);
  return typedBuffer;
}

class TcpConnection {
  /* @param {nsISocketTransport} transport
   */
  constructor(transport) {
    this.transport = transport;
    this.transportPort = transport.port;
    this.id = getRandomID();

    this.input = transport.openInputStream(Ci$1.nsITransport.OPEN_BLOCKING, 0, 0).QueryInterface(Ci$1.nsIAsyncInputStream);
    this.output = transport.openOutputStream(Ci$1.nsITransport.OPEN_BLOCKING, 0, 0);

    // Create binary writer
    this._binaryWriter = Components.classes['@mozilla.org/binaryoutputstream;1'].createInstance(Components.interfaces.nsIBinaryOutputStream);
    this._binaryWriter.setOutputStream(this.output);

    // Create binary reader
    this._binaryReader = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
    this._binaryReader.setInputStream(this.input);

    // Callbacks
    this.onClose = null;

    logger.debug(`TCP new connection ${JSON.stringify({
      input: this.input,
      output: this.output,
      transportPort: this.transportPort,
      id: this.id
    })}`);
  }

  /* Close the connection.
   */
  close() {
    // Close the transport and any open streams.
    // Closing transport already close any opened stream
    // this.input.close();
    // this.output.close();
    this.transport.close(OK_RESULT);
  }

  /* Sends a chunk of data through the opened socket.
   *
   * @param {Uint8Array} data - Chunk of data to be sent.
   * @param {integer} length - Number of octets to be sent.
   */
  sendData(data, length) {
    logger.debug(`TCP ${this.id} sends ${length} octets`);
    return Promise.resolve(this._binaryWriter.writeByteArray(data, length)).catch(ex => {
      logger.debug(`TCP exception on sendData ${ex}`);
    });
  }

  /* Returns a promise wrapping the next chunk of data received
   * through the opened socket.
   */
  getNextData() {
    const self = this;

    return new Promise((resolve, reject) => {
      this.input.asyncWait({
        onInputStreamReady() {
          try {
            const data = readBytes(self._binaryReader);
            logger.debug(`TCP socket ${self.id} received ${data.length} octets`);
            resolve(data);
          } catch (ex) {
            self.close();
            reject(ex);
          }
        }
      }, 0, 0, MAIN_THREAD);
    });
  }

  /* Registers a callback to be called everytime a new chunk
   * of data is received through the socket.
   *
   * @param {function} callback - callback called on each chunk of data.
   */
  registerCallbackOnData(callback) {
    this.getNextData().then(data => {
      callback(data);
      this.registerCallbackOnData(callback);
    }).catch(ex => {
      logger.debug(`TCP ${this.id} closing connection ${ex} ${ex.stack}`);
      try {
        // Make sure transport is properly closed
        this.close();
      } catch (e) {
        // Exception might be raised for already closed streams
      }

      if (this.onClose !== null) {
        this.onClose();
      }
    });
  }

  registerCallbackOnClose(callback) {
    this.onClose = callback;
  }
}

/* Opens a new socket connected to given host and port.
 *
 * @param {String} host - Host to connect to.
 * @param {String} port - Port to use.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;


class SocksProxy {
  constructor(port) {
    this.host = '127.0.0.1';

    this._socket = Cc['@mozilla.org/network/server-socket;1'].createInstance(Ci.nsIServerSocket);

    // Choose a random port
    this._socket.init(port, true, -1);
    this._socket.asyncListen(this);

    this.onSocketOpen = undefined;
    this.port = port;
  }

  isInitialized() {
    return this._socket !== null;
  }

  getHost() {
    return this.host;
  }

  getPort() {
    return this._socket.port;
  }

  addSocketOpenListener(callback) {
    this.onSocketOpen = callback;
  }

  unload() {
    this._socket.close();
  }

  /* Accept a request from a new client.
   *
   * @param {nsIServerSocket} socket - The server socket
   * @param {nsISocketTransport} transport - The connected socket transport
   */
  onSocketAccepted(socket, transport) {
    try {
      if (this.onSocketOpen !== undefined) {
        this.onSocketOpen(new TcpConnection(transport));
      } else {
        // TODO: Exception or logging?
      }
    } catch (ex) {
      logger.error(`SOCKS PROXY error on socket accept ${ex}`);
    }
  }

  onStopListening() /* socket, status */{}
}

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

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function randID() {
  return Math.floor(Math.random() * 4294967296);
}

const Cu = Components.utils;

// From https://github.com/mozilla/adbhelper/blob/2963e0dc210a50135a58a8ac68c757625862a6a4/adb-socket.js#L16

function createTCPSocket(location, port) {
  let options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { binaryType: 'arraybuffer' };

  // Starting with FF57, jsm share the same global and requires some special code
  var _Cu$getGlobalForObjec = Cu.getGlobalForObject(Cu.import('resource://gre/modules/Services.jsm', {}));

  const TCPSocket = _Cu$getGlobalForObjec.TCPSocket;

  // Starting with FF43, TCPSocket is now exposed via WebIDL

  if (TCPSocket) {
    return new TCPSocket(location, port, options);
  }

  // For FF42 and previous
  const scope = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal());
  scope.DOMError = Cu.import('resource://gre/modules/Services.jsm', {}).DOMError;
  Services.scriptloader.loadSubScript('resource://gre/components/TCPSocket.js', scope);
  scope.TCPSocket.prototype.initWindowless = function initWindowless() {
    return true;
  };
  const socket = new scope.TCPSocket();
  return socket.open(location, port, options);
}

class TorProxy$1 {
  constructor() {
    let torWorkerPath = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'resource://cliqz/tor/worker.bundle.js';
    let args = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ['ControlPort', '9351', 'SocksPort', '9350', 'DataDirectory', '/torjs'];

    this.proxyPeer = null;
    this.sockets = {};
    this.servers = {};
    this.args = args;
    this.torWorkerPath = torWorkerPath;
  }

  log() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    console$1.log('[tor-proxy]', ...args);
  }

  initTorJS() {
    this.worker = new Worker(this.torWorkerPath);

    this.manager = new TorManager(this.worker);
    this.manager.sendRun({ args: this.args });

    this.manager.onserver = port => {
      if (this.servers[port]) {
        throw new Error(`[tor-proxy] Already listening ${port}`);
      }
      const server = new SocksProxy(port);
      this.servers[port] = server;

      server.addSocketOpenListener(_socket => {
        const socket = _socket;
        const id = randID();
        this.sockets[id] = socket;

        this.manager.sendSocket(id, '127.0.0.1', port);

        socket.registerCallbackOnData(data => {
          this.manager.send(id, data);
        });

        socket.registerCallbackOnClose(() => {
          delete this.sockets[id];
          this.manager.sendClose(id);
        });
      });
    };

    this.manager.onsocket = (id, host, port) => {
      // TODO: we should do some checks here, it's a bit dangerous.
      // Probably should avoid private ips and check that port is ok.
      const s = createTCPSocket(host, port);
      this.sockets[id] = s;
      s.onopen = () => {
        this.manager.sendOpen(id);
      };

      s.onerror = () => {
        delete this.sockets[id];
        this.manager.sendClose(id);
      };

      s.ondrain = () => {
        this.log('torjs socket drain!', id);
      };

      s.ondata = _e => {
        this.manager.send(id, _e.data);
      };

      s.onclose = () => {
        delete this.sockets[id];
        this.manager.sendClose(id);
      };
    };

    this.manager.onsend = (id, data) => {
      const s = this.sockets[id];
      if (s) {
        if (s.send) {
          s.send(data.buffer);
        } else {
          s.sendData(data, data.length);
        }
      }
    };
    this.manager.onclose = id => {
      const s = this.sockets[id];
      if (s) {
        s.close();
        delete this.sockets[id];
      }
    };
  }

  init() {
    var _this = this;

    return _asyncToGenerator(function* () {
      _this.initTorJS();
    })();
  }

  unload() {
    clearInterval(this.socketChecker);
    delete this.socketChecker;
    Object.keys(this.sockets).forEach(k => {
      try {
        this.sockets[k].close();
      } catch (e) {
        this.log('error', e);
      }
    });

    Object.keys(this.sockets).forEach(k => {
      try {
        this.sockets[k].close();
      } catch (e) {
        this.log('error', e);
      }
    });
    this.sockets = {};
    this.sockets = {};
    Object.keys(this.servers).forEach(k => {
      try {
        this.servers[k].unload();
      } catch (e) {
        this.log('error', e);
      }
    });
    this.servers = {};
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

var TorProxy = TorProxy$1;
var EXPORTED_SYMBOLS = ['TorProxy'];
