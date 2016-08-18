
var Client = module.exports;

var Promise = require('bluebird');
var request = require('request');
var _ = require('lodash');

var d = require("debug")("raptorjs:client:http");

Client.create = function (opts) {

  var defaultsOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': opts.apiKey
    },
    baseUrl: opts.url,
    json: true,
    debug: opts.debug
  };

  var client = request.defaults(defaultsOptions);

  d("Created new client %s", defaultsOptions.baseUrl);

  var instance = {};
  instance.request = function (options) {
    return new Promise(function (resolve, reject) {

      options = options || {};

      if(options.headers) {
        _.each(defaultsOptions.headers, function (key, val) {
          if(options.headers[key] === undefined) {
            options.headers[key] = val;
          }
        });
      }

      d("Performing request %j", options);
      client(options, function (err, res, body) {

        if(err) {
          d("Request failed %s", err.message);
          return reject(err);
        }

        var json;
        try {
          json = JSON.parse(body);
        } catch(e) {
          json = body;
        }

        if(res.statusCode >= 400) {
          d("Request error %s %s", res.statusCode , res.statusMessage);
          return reject(new Error(
            res.statusCode + " " + res.statusMessage + ": " + JSON.stringify(json)
          ));
        }

        d("Request response: %j", json);
        resolve(json);
      });

    });
  };

  instance.get = function (url) {
    return instance.request({
      method: 'GET',
      url: url
    });
  };

  instance.delete = function (url) {
    return instance.request({
      method: 'DELETE',
      url: url
    });
  };

  instance.put = function (url, data) {
    return instance.request({
      method: 'PUT',
      url: url,
      body: data
    });
  };

  instance.post = function (url, data) {
    return instance.request({
      method: 'POST',
      url: url,
      body: data
    });
  };

  instance.client = client;

  // handles MQTT subscriptions
  instance.subscribe = function(streamName) {

  };

  return instance;
};