var _ = require('lodash');

var util = require('../util');

var RecordSet = require('./RecordSet');
var ResultSet = require('./ResultSet');
var Channel = require('./Channel');

var StreamSearch = require("./StreamSearch");

/**
 * A Stream object
 * @constructor
 * @param {Object} obj An object with the Stream properties
 */
var Stream = function (data, serviceObject) {

  this.data = {
    name: null,
    description: null,
    type: null,
    channels: {},
  };

  if(!serviceObject) {
    throw new Error("Missing serviceObject parameter on Stream creation");
  }

  this.setServiceObject(serviceObject);
  this.client = this.getContainer().client;

  this.exportProperties();

  if(data) this.parseJSON(data);
};
util.extends(Stream, 'Container');

Stream.prototype.validate = function () {

  if(!this.name)
    throw new Error("Stream name is required");

  if(!this.channels || !_.size(this.channels))
    throw new Error("At least one stream channel is required");

  _.forEach(this.channels, function (channel, channelName) {
    channel.validate();
  });

};

Stream.prototype.toJSON = function () {
  var json = this.__super__.toJSON.call(this);
  json.channels = {};
  _.forEach(this.channels, function (channel, name) {
    json.channels[channel.name] = channel.toJSON();
  });

  return json;
};

Stream.prototype.parseJSON = function (data) {

  var me = this;

  var parseChannels = function (channelsData) {
    _.forEach(channelsData, function (raw, channelName) {

      if(typeof raw === 'string') {
        raw = {
          name: channelName,
          type: raw
        };
      }

      if(!raw.name && typeof channelName === "string")
        raw.name = channelName;

      var channel = new Channel(raw, me);
      me.channels[channel.name] = channel;
    });
  };

  if(data.name)
    this.data.name = data.name;

  if(data.description)
    this.data.description = data.description;

  if(data.type)
    this.data.type = data.type;

  if(data.channels) {
    parseChannels(data.channels);
  }

};

/**
 * Create a pubsub subscription for the stream
 * @return {Promise} A promise for the subscription object creation
 */
Stream.prototype.subscribe = function (fn) {
  var topic = this.getServiceObject().id + '/stream/' + this.data.name + '/updates';
  return this.client.subscribe(topic, fn).bind(this);
};

/**
 * Remove a subscription for a stream
 *
 * @param {Function} fn Callback to be called when data is received
 * @return {Stream} The current stream
 */
Stream.prototype.unsubscribe = function (fn) {
  var topic = this.serviceObject.id + '/stream/' + this.data.name + '/updates';
  return client.unsubscribe(topic, fn).bind(this);
};

/**
 * Send data to a ServiceObject stream
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.push = function (data, lastUpdate) {

  var url = '/' + this.getServiceObject().id + '/streams/' + this.name;

  var record = new RecordSet(data, this);
  if(lastUpdate) record.setLastUpdate(lastUpdate);

  return this.client.put(url, record);
};

/**
 * Retieve data from a ServiceObject stream
 *
 * @param {String} timeModifier  optional, possible values: lastUpdate, 1199192940 (time ago as timestamp)
 * @param {int} size             optional, the number of elements to return
 * @param {int} from             optional, the first value to get from the list for paging
 *
 * @return {Promise}             Promise callback with result
 */
Stream.prototype.pull = function (timeModifier, size, offset) {

  timeModifier = timeModifier || "";
  if(timeModifier) {
    isDate = util.parseDate(timeModifier, false);
    if (isDate) {
      timeModifier = util.toUNIX(timeModifier);
    }
    else timeModifier = 'lastUpdate';
  }

  var qs = '';
  if(size || offset !== undefined) {

    var obj = {};
    if(size) obj.size = size;
    if(offset !== undefined) obj.offset = offset;

    qs = util.buildQueryString(obj);
  }

  var url = '/' + this.getServiceObject().id + '/streams/' + this.name + '/' + timeModifier + qs;
  return this.client.get(url, null).bind(this).then(function (res) {

    var data = [];
    if(res && res.data) {
      if(res.data instanceof Array) {
        data = res.data;
      }
      else {
        data = [ res.data ];
      }
    }

    return Promise.resolve(new ResultSet(data, this));
  });
};

/**
 * Search data of a ServiceObject stream
 *
 * @param {Object} options      search options
 * @param {int} size            optional, the number of elements to return
 * @param {int} offset            optional, the first value to get from the list for paging
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.search = function (searchOptions, size, offset) {
  var me = this;

  if(!me.getServiceObject().id) {
    return Promise.reject(new Error("Missing ServiceObject id."));
  }

  if(!searchOptions) {
    return Promise.reject(new Error("No params provided for search"));
  }

  var loadParams = function (options) {
    var getFieldName = function (opts) {

      var hasField = (typeof opts.field !== 'undefined' && opts.field),
        hasChannel = (typeof opts.channel !== 'undefined' && opts.channel && me.getChannel(opts.channel));

      if(!hasChannel && !hasField) {
        throw new Error("At least a valid `channel` or `field` properties has to be provided for numeric search");
      }

      if(hasField) {
        return opts.field;
      } else if(hasChannel) {
        return "channels." + opts.channel + ".current-value";
      }
    };

    var hasProp = function (data, name) {
      return 'undefined' !== data[name];
    };

    var params = {};

    /**
    {
        "numericrange": true,
        "rangefrom": 13,
        "rangeto": 17,
        "numericrangefield": "channels.age.current-value",
    }

    {
        numeric: {
            channel: 'name'
            from: 1
            to: 10
        }
    }

    */
    var queryParams = options.numeric;
    if(queryParams) {

      params.numericrange = true;
      params.numericrangefield = getFieldName(queryParams);

      var hasFrom = hasProp(queryParams, "from"),
        hasTo = hasProp(queryParams, "to");

      if(!hasFrom && !hasTo) {
        throw new Error("At least one of `from` or `to` properties has to be provided for numeric range search");
      }

      if(hasFrom) {
        params.rangefrom = queryParams.from;
      }

      if(hasTo) {
        params.rangeto = queryParams.to;
      }

    }

    /**
    {
        "timerange": true,
        "rangefrom": 1396859660,
    }

    {
        time: {
            from: time
            to: time
        }
    }
    */
    queryParams = options.time;
    if(queryParams) {

      params.timerange = true;

      var hasFrom = hasProp(queryParams, "from"),
        hasTo = hasProp(queryParams, "to");

      if(!hasFrom && !hasTo) {
        throw new Error("At least one of `from` or `to` properties has to be provided for time range search");
      }

      // set defaults
      // if from is not set, set to epoch
      queryParams.from = queryParams.from || (new Date(0));
      // if to is not set, set to now
      queryParams.to = queryParams.to || (new Date());

      // a timestamp is expected but try parsing other values too
      var getTimeVal = function (val, label) {

        var type = typeof val;
        var date;
        var err = false;

        if(type === 'number') {

          var d = new Date(val);
          if(d.getTime() !== val) {
            d = new Date(val * 1000);
            if(d.getTime() !== val) {
              err = true;
            }
          }

          if(!err) {
            date = d;
          }
        } else if(type === "string") {
          var d = new Date(val);
          if(!d) {
            err = true;
          } else {
            date = d;
          }
        } else if(val instanceof Date) {
          date = val;
        }

        if(err || !date) {
          throw new Error("The value " + val + " for `" + label + "` cannot be parsed as a valid date");
        }

        // convert to seconds
        return Math.round(date.getTime() / 1000);
      };

      if(hasFrom) {
        params.rangefrom = getTimeVal(queryParams.from, 'timeRange.from');
      }

      if(hasTo) {
        params.rangeto = getTimeVal(queryParams.to, 'timeRange.to');
      }

    }

    /**
    {
        "match": true,
        "matchfield": "channels.name.current-value",
        "matchstring": "Peter John",

        options.match : {
            channel: '',
            string: ''
        }

    }
    */
    var queryParams = options.match;
    if(queryParams) {

      params.match = true;
      params.matchfield = getFieldName(queryParams);

      var hasString = hasProp(queryParams, "string");

      if(!hasString) {
        throw new Error("A value for `string` property has to be provided for text based search");
      }

      params.string = queryParams.string;
    }


    var checkForLocationChannel = function () {
      if(!me.getChannel('location')) {
        throw new Error("To use geospatial based search a `location` channel is required");
      }
    };

    /**
    {
        "geoboundingbox": true,
        "geoboxupperleftlon": 15.43,
        "geoboxupperleftlat": 43.15,
        "geoboxbottomrightlat": 47.15,
        "geoboxbottomrightlon": 15.47

        bbox: {
            coords: [
                { latitude: '', longitude: ''}, // top position
                { latitude: '', longitude: ''}  // bottom position
            ]
        }
    }
    */
    var queryParams = options.bbox;
    if(queryParams) {

      checkForLocationChannel();

      params.geoboundingbox = true;

      var hasBbox = false;
      if(queryParams.coords) {
        // [toplat, toplon, bottomlat, bottomlon]
        if(queryParams.coords instanceof Array && queryParams.coords.length === 4) {
          params.geoboxupperleftlat = queryParams.coords[0];
          params.geoboxupperleftlon = queryParams.coords[1];
          params.geoboxbottomrightlat = queryParams.coords[2];
          params.geoboxbottomrightlon = queryParams.coords[3];
          hasBbox = true;
        }
        //[{lat, lon}, {lat, lon}]
        if(queryParams.coords instanceof Array && queryParams.coords.length === 2) {
          params.geoboxupperleftlat = queryParams.coords[0].lat || queryParams.coords[0].latitude;
          params.geoboxupperleftlon = queryParams.coords[0].lon || queryParams.coords[0].longitude;
          params.geoboxbottomrightlat = queryParams.coords[1].lat || queryParams.coords[1].latitude;
          params.geoboxbottomrightlon = queryParams.coords[1].lon || queryParams.coords[1].longitude;
          hasBbox = true;
        }
      }

      if(!hasBbox) {
        throw new Error("The values provided for `coords` option are not valid");
      }

    } else {

      if(options.bbox) {
        (console && console.warn) && console.warn("`bbox` and `distance` search are not compatible, `bbox` will be used");
      }

      /*
       {
          "geodistance": true,
          "geodistancevalue": 300,
          "pointlat": 43.15,
          "pointlon": 15.43,
          "geodistanceunit": "km"
      }

      {
          distance: {
              position: {latitude: '', longitude: ''}
              // or
              // position: [lat, lon]
              value: 'val',
              unit: 'km'
          }
      }


      */
      var queryParams = options.distance;
      if(queryParams) {

        checkForLocationChannel();

        params.geodistance = true;

        if(queryParams.position) {
          var position = queryParams.position;
          var isArray = (position instanceof Array);
          queryParams.lat = isArray ? position[0] : (position.latitude || position.lat);
          queryParams.lon = isArray ? position[1] : (position.longitude || position.lon);
        }

        var hasValue = hasProp(queryParams, "value"),
          hasLat = hasProp(queryParams, "lat") || hasProp(queryParams, "latitude"),
          hasLng = hasProp(queryParams, "lon") || hasProp(queryParams, "longitude");

        if(!hasLat || !hasLng || !hasValue) {
          throw new Error("`latitude`, `longitude` and `value` properties must be provided for distance search");
        }

        params.geodistanceunit = queryParams.unit || "km";
        params.geodistancevalue = queryParams.value;
        params.pointlat = queryParams.lat || queryParams.latitude;
        params.pointlon = queryParams.lon || queryParams.longitude;

      }
    }

    return params;
  };

  // Handle "array-based" search with multiple params
  if(searchOptions instanceof Array) {
    var params = [];
    for(var i = 0, len = searchOptions.length; i < len; i++) {
      var param = loadParams(searchOptions[i]);
      params.push(param);
    }
  } else {
    var params = loadParams(searchOptions);
  }

  var qs = '';
  if(size || from !== undefined) {

    var obj = {};
    if(size) obj.size = size;
    if(from !== undefined) obj.from = from;

    qs = util.buildQueryString(obj);
  }

  var url = '/' + me.container().id + '/streams/' + me.name + '/search' + qs;
  me.getContainer().getClient().post(url, params).then(function (res) {

    var data = [];
    if(res && res.data) {
      data = res.data;
    }

    var dataset = new RecordSet(data);
    dataset.setContainer(me.getContainer());

    return Promise.resolve(dataset);
  });
};

/**
 * Search data of a ServiceObject by distance from a point
 *
 * @param {Object} position An object representing a geo-position, eg `{ latitude: 123 , longitude: 321 }`
 * @param {Number} distance The distance value
 * @param {String} unit Optional unit, default to `km`
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.searchByDistance = function (position, distance, unit) {
  return this.search({
    distance: {
      position: position,
      value: distance,
      unit: unit
    }
  });
};

/**
 * Search data of a ServiceObject in a Bounding Box
 *
 * @param {Array} bbox An array of 4 elements representing the bounding box, eg
 *                      ```
 *                      [
 *                          upperLat, upperLng,
 *                          bottomLat, bottomLng
 *                      ]
 *                      ```
 *                or an Array with 2 elements each one as an object eg
 *                      ```
 *                      [
 *                          { latitude: 123, longitude: 321 }, // upper
 *                          { latitude: 321, longitude: 123 }  // bottom
 *                      ]
 *                      ```
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.searchByBoundingBox = function (bbox) {
  return this.search({
    bbox: {
      coords: bbox
    }
  });
};

/**
 * Search text for a channel of a ServiceObject stream
 *
 * @param {String} channel The channel name where to search in
 * @param {Number} string The string query to search for
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.searchByText = function (channel, string) {
  return this.search({
    match: {
      string: string,
      channel: channel
    }
  });
};

/**
 * Search data by the update time range of a ServiceObject stream
 *
 * @param {Object} params An object with at least one of `from` or `to` properties
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.searchByTime = function (params) {
  if(typeof params !== "object") {
    params = {
      from: arguments[0],
      to: arguments[1]
    };
  }
  return this.search({
    time: params
  });
};

/**
 * Search data by a numeric value of a ServiceObject stream
 *
 * @param {String} channel Channel name to search for
 * @param {Object} params An object with at least one of `from` or `to` properties
 *
 * @return {Promise} Promise callback with result
 */
Stream.prototype.searchByNumber = function (channel, params) {
  if(typeof params !== 'object') {
    params = {
      from: arguments[1],
      to: arguments[2]
    };
  }
  params.channel = channel;
  return this.search({
    numeric: params
  });
};

module.exports = Stream;