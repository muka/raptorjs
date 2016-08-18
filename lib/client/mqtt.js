
var Client = module.exports;

var Promise = require('bluebird');
var request = require('request');
var _ = require('lodash');

var d = require("debug")("raptorjs:client:mqtt");

Client.create = function(opts) {

  var client;
  var instance = {};

  var ee = require('event-emitter');
  var hasListeners = require('event-emitter/has-listeners');

  var emitter = ee({});

  var parseJSON = function(msg) {
    try {
      return JSON.parse(msg);
    } catch(e) {}
    return msg;
  };

  instance.emitter = emitter;

  instance.connect = function() {
    return new Promise(function(resolve, reject) {

      var isNode = typeof window === 'undefined';

      var url = require("url").parse(opts.url);
      var mqttUrl = "mqtt://" + url.hostname + ":1883";

      d("Connecting to %s", mqttUrl);

      var mqtt = require("mqtt");
      client = mqtt.connect(mqttUrl, {
        protocolId: 'MQTT',
        protocolVersion: 4,
        username: "raptorjs",
        password: opts.apiKey,
      });
      instance.client = client;

      var onError = function(e) {
        d("Connection error", e);
        client.removeListener('connect', onConnect);
        client.removeListener('error', onError);
        reject(e);
      };
      var onConnect = function() {
        d("Connected");
        client.removeListener('connect', onConnect);
        client.removeListener('error', onError);
        resolve();
      };

      client.on('connect', onConnect);
      client.on('error', onError);

      client.on('error', function(e) {
        emitter.emit("error", e);
      });
      client.on("message", function(topic, message) {

          var msg = parseJSON(message.toString());

          d("Received message: %j", msg);

          emitter.emit("message", msg);
          emitter.emit(topic, msg);
      });

    });
  };
  instance.subscribe = function(topic, fn) {
    return instance.connect().then(function() {
      d("Subscribing to %s", topic);
      client.subscribe(topic, function() {
        d("Subscribed");
      });
      if(fn) emitter.on(topic, fn);
      return Promise.resolve(emitter);
    });
  };
  instance.unsubscribe = function(topic, fn) {
    return instance.connect().then(function() {
      d("Unsubscribing from %s", topic);
      client.unsubscribe(topic, function() {
        d("Unsubscribed");
      });
      if(fn) emitter.off(topic, fn);
      return Promise.resolve(emitter);
    });
  };

  return instance;
};