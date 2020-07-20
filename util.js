'use strict'

var request = require("request");
const staticValues = {
  "name": "Messana Plugins",
  "description": "Messana plugins",
  "manufacturer": "Messana Inc.",
  "apiroute": "http://localhost:9000/api/"
}
exports.staticValues = staticValues

exports.httpRequest = (url, body, method, callback) => {
  if (method == 'PUT' || method == 'POST') {
    request({
      method: "PUT",
      uri: url,
      json: body
    }, function(error, response, body) {
      callback(error, response, body);
    });
  } else {
    request({
        url: url,
        body: body,
        method: 'GET',
        timeout: 1000,
        rejectUnauthorized: false,
        auth: undefined
      },
      function(error, response, body) {
        callback(error, response, body);
      });
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
