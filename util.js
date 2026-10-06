'use strict'

var request = require("request");
const staticValues = {
  "name": "Messana Plugins",
  "description": "Messana plugins",
  "manufacturer": "Messana Inc.",
  "apiroute": "http://localhost:9000/api/"
}
exports.staticValues = staticValues

// Every accessory polls the backend on its own timer, and at Homebridge start
// they all fire in the same second: the backend queues and answers in more
// than one second. With the old fixed 1 s timeout and no retry that start-up
// burst turned into dozens of ETIMEDOUT and "Not Responding" tiles, although
// the backend never lost a request. Hence: a longer timeout, a short retry,
// one shared request for identical concurrent GETs, and the last good answer
// when the backend really cannot be reached.
const GET_TIMEOUT_MS = 5000;
const PUT_TIMEOUT_MS = 5000;
const GET_RETRIES = 2;
const RETRY_BASE_MS = 250;
const LAST_GOOD_MAX_AGE_MS = 5 * 60 * 1000;

// url -> callbacks waiting for the GET already in flight
const inFlight = {};
// url -> { response, body, at } of the last successful GET
const lastGood = {};

function getOnce(url, body, attempt, done) {
  request({
      url: url,
      body: body,
      method: 'GET',
      timeout: GET_TIMEOUT_MS,
      rejectUnauthorized: false,
      auth: undefined
    },
    function(error, response, responseBody) {
      if (error && attempt < GET_RETRIES) {
        var delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * RETRY_BASE_MS);
        setTimeout(function() { getOnce(url, body, attempt + 1, done); }, delay);
        return;
      }
      done(error, response, responseBody);
    });
}

function httpGet(url, body, callback) {
  var key = url + ' ' + (body || '');

  if (inFlight[key]) {
    inFlight[key].push(callback);
    return;
  }
  inFlight[key] = [callback];

  getOnce(url, body, 0, function(error, response, responseBody) {
    if (!error && response && response.statusCode < 400) {
      lastGood[key] = { response: response, body: responseBody, at: Date.now() };
    } else if (error && lastGood[key] && Date.now() - lastGood[key].at <= LAST_GOOD_MAX_AGE_MS) {
      error = null;
      response = lastGood[key].response;
      responseBody = lastGood[key].body;
    }

    var waiting = inFlight[key];
    delete inFlight[key];
    waiting.forEach(function(cb) { cb(error, response, responseBody); });
  });
}

// ---------------------------------------------------------------------------
// Snapshot cache
//
// Even with the fixes above every read handler waited for the backend, and
// HomeKit gives a handler 3 s before it warns and 9 s before it gives up. With
// 45 accessories the plugins sent 40-60 GETs per second, the single-threaded
// backend ran at 100% CPU and a full HomeKit read took longer than those 9 s.
//
// Now the values are read from memory. One poller asks the backend for every
// value the accessories use, all in a single request (POST homebridge/snapshot),
// once per cycle, and the read handlers are answered from what it brought back.
//
// The five Messana plugins are separate packages, each with its own copy of this
// file, but they run in the same Homebridge process: the cache hangs off a global
// symbol so that there is one cache and one poller, not five.
//
// A backend that does not have the snapshot route yet answers 404: the plugins
// then go back to one GET per value, exactly as before.
// ---------------------------------------------------------------------------
const SNAPSHOT_ROUTE = 'homebridge/snapshot';
const SNAPSHOT_INTERVAL_MS = 5000;
const SNAPSHOT_TIMEOUT_MS = 4000;
// A read that finds nothing in memory waits for the next snapshot, but stays
// below the 3 s after which Homebridge reports the plugin as slow.
const SNAPSHOT_FIRST_WAIT_MS = 2500;
const SNAPSHOT_RETRY_UNSUPPORTED_MS = 10 * 60 * 1000;
const SNAPSHOT_FORGET_PATH_MS = 15 * 60 * 1000;
const SNAPSHOT_GLOBAL = Symbol.for('messana.homebridge.snapshot.v1');

function createSnapshotCache() {
  var base = null;          // 'http://localhost:9000/api/'
  var query = '';           // '?apikey=...'
  var wanted = {};          // path -> last time an accessory asked for it
  var entries = {};         // path -> { statusCode, body, at }
  var waiting = {};         // path -> [ { done } ] reads waiting for the first value
  var polling = false;
  var pollAgain = false;
  var timer = null;
  var unsupportedUntil = 0;

  function answerWaiting(path, entry) {
    var list = waiting[path];
    if (!list) return;
    delete waiting[path];
    list.forEach(function(waiter) { waiter.done(entry); });
  }

  function poll() {
    if (polling) { pollAgain = true; return; }
    if (!base || Date.now() < unsupportedUntil) return;

    var now = Date.now();
    Object.keys(wanted).forEach(function(path) {
      if (now - wanted[path] > SNAPSHOT_FORGET_PATH_MS) { delete wanted[path]; delete entries[path]; }
    });
    var paths = Object.keys(wanted);
    if (!paths.length) return;

    polling = true;
    pollAgain = false;
    request({
      method: 'POST',
      uri: base + SNAPSHOT_ROUTE + query,
      json: { paths: paths },
      timeout: SNAPSHOT_TIMEOUT_MS
    }, function(error, response, body) {
      polling = false;

      if (!error && response && response.statusCode == 404) {
        // Backend older than the snapshot route.
        unsupportedUntil = Date.now() + SNAPSHOT_RETRY_UNSUPPORTED_MS;
        entries = {};
        console.log('[Messana] The backend has no ' + SNAPSHOT_ROUTE + ' route: reading one value per request.');
      }

      var values = (!error && response && response.statusCode < 400 && body && body.value) || null;
      if (values) {
        var at = Date.now();
        Object.keys(values).forEach(function(path) {
          entries[path] = { statusCode: values[path].status, body: JSON.stringify(values[path].body), at: at };
        });
      }

      // Whoever is still waiting gets its value, or goes to the backend directly.
      Object.keys(waiting).forEach(function(path) { answerWaiting(path, (values && values[path] && entries[path]) || null); });

      if (pollAgain) poll();
    });
  }

  function get(url, callback) {
    var q = url.indexOf('?');
    var route = staticValues.apiroute;
    if (q < 0 || url.indexOf(route) !== 0 || Date.now() < unsupportedUntil) return false;

    var path = url.slice(route.length, q).replace(/\/$/, '');
    base = route;
    query = url.slice(q);
    wanted[path] = Date.now();

    if (!timer) {
      timer = setInterval(poll, SNAPSHOT_INTERVAL_MS);
      if (timer.unref) timer.unref();
    }

    var entry = entries[path];
    if (entry && Date.now() - entry.at <= LAST_GOOD_MAX_AGE_MS) {
      setImmediate(function() { callback(null, { statusCode: entry.statusCode }, entry.body); });
      return true;
    }

    // First read of this value: ask for a snapshot now. The reads that start in
    // the same instant (all the accessories at start-up) end up in the same one.
    var waiter = {
      done: function(found) {
        clearTimeout(waiter.timeout);
        if (found) callback(null, { statusCode: found.statusCode }, found.body);
        else httpGet(url, '', callback);
      }
    };
    waiter.timeout = setTimeout(function() {
      var list = waiting[path] || [];
      var i = list.indexOf(waiter);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) delete waiting[path];
      httpGet(url, '', callback);
    }, SNAPSHOT_FIRST_WAIT_MS);
    (waiting[path] = waiting[path] || []).push(waiter);
    setImmediate(poll);
    return true;
  }

  return { get: get, refresh: poll };
}

const snapshot = global[SNAPSHOT_GLOBAL] || (global[SNAPSHOT_GLOBAL] = createSnapshotCache());

exports.httpRequest = (url, body, method, callback) => {
  if (method == 'PUT' || method == 'POST') {
    // No retry: a write that timed out may still have been applied.
    request({
      method: "PUT",
      uri: url,
      json: body,
      timeout: PUT_TIMEOUT_MS
    }, function(error, response, body) {
      // Read the new state now, so that the next refresh of the accessories
      // does not put the value from before the write back on the screen.
      snapshot.refresh();
      callback(error, response, body);
    });
  } else if (!snapshot.get(url, callback)) {
    httpGet(url, body, callback);
  }
}

exports.convertC2F = (valueC, unit) => {
  if(unit == 0) return valueC;//Celsius
  return Math.round(valueC * 9/5 + 32)
}

exports.convertF2C = (valueF, unit) => {
  if(unit == 0) return valueF;//Celsius
  return Math.round((Math.floor(valueF)-32)*5/9*2)/2
}

exports.getApiKey = (api) => {
  var messanaPlatform = (require(api.user.configPath()))
  .platforms.find(
    function(platform){ return platform["platform"] === "MessanaPlatform" }
  )
  return (messanaPlatform) ? messanaPlatform.apikey: ""
}
