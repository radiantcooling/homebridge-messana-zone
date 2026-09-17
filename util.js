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

exports.httpRequest = (url, body, method, callback) => {
  if (method == 'PUT' || method == 'POST') {
    // No retry: a write that timed out may still have been applied.
    request({
      method: "PUT",
      uri: url,
      json: body,
      timeout: PUT_TIMEOUT_MS
    }, function(error, response, body) {
      callback(error, response, body);
    });
  } else {
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
