/**
Copyright 2016 CREATE-NET

@author Luca Capra <luca.capra@create-net.org>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 *
 * A list of Channel of a Stream
 *
 * @constructor
 * @augments ObjectList
 */
var ChannelsList = function (channels) {
    compose.util.List.ObjectList.apply(this);
    this.initialize(channels);
};
compose.util.extends(ChannelsList, compose.util.List.ObjectList);

ChannelsList.prototype.validate = function (channel) {

    //            if(!channel.name) {
    //                throw new ValidationError("Channel must have a `name` property");
    //            }
    //
    //            if(!channel.type) {
    //                throw new ValidationError("Channel must have a `type` property");
    //            }
    //
    //            if(!channel.unit) {
    //                throw new ValidationError("Channel must have a `unit` property");
    //            }
    //
    //            if(channel.type !== 'Number' || channel.type !== 'String' || channel.type !== 'Boolean' ) {
    //                throw new ValidationError("Channel `type` must be one of Number, String or Boolean");
    //            }

    return channel;
};


/**
 *
 * A list of Stream objects of a WebObject
 *
 * @constructor
 * @augments ObjectList
 */
var StreamList = function (streams) {

    compose.util.List.ObjectList.apply(this);

    if(this instanceof StreamList) {
        this.initialize(streams);
    }

};
compose.util.extends(StreamList, compose.util.List.ObjectList);

StreamList.prototype.add = function (name, obj) {

    if(typeof name === "object") {
        for(var i in name) {
            this.add(i, name[i]);
        }
        return this;
    }

    // handle arrays using the obj.name property
    if(obj.name && (typeof (parseFloat(name)) === 'number')) {
        name = obj.name;
    }

    if(!obj.name) {
        obj.name = name;
    }

    var stream = this.validate(obj);
    this.getList()[name] = stream;

    return stream;
};

/**
 * @param {String} name Identifier name
 * @return {Number} Return the index or -1 if not found
 */
StreamList.prototype.getIndex = function (name, key) {

    var list = this.getList();

    if(list[name]) {
        return name;
    }

    key = key || 'name';
    var _size = this.size();
    for(var i = 0; i < _size; i++) {
        if(list[i][key] === name) {
            return i;
        }
    }

    return -1;
};

StreamList.prototype.validate = function (stream) {

    var streamObj = new Stream(stream);
    streamObj.container(this.container());

    return streamObj;
};

/*
 *
 * @param {boolean} asString Return as string if true, object otherwise
 * @returns {Object|String}
 */
StreamList.prototype.toJson = StreamList.prototype.toJSON = function (asString) {

    var list = this.getList();
    var json = copyVal(list);

    return asString ? JSON.stringify(json) : json;
};

StreamList.prototype.toString = function () {
    return this.toJson(true);
};

/**
 *
 * A Stream object
 *
 * @constructor
 */
var Stream = function (obj) {
    if(this instanceof Stream) {
        this.initialize(obj);
    }
};

Stream.prototype.__$container;

Stream.prototype.container = function (o) {
    this.__$container = o || this.__$container;
    return this.__$container;
};

/**
 * Add a list of elements provided as argument to the stream
 * @param {Object} obj An object with the properties to set for the Stream
 */
Stream.prototype.initialize = function (obj) {

    obj = obj || {};

    for(var i in obj) {
        if(!this[i]) {
            this[i] = obj[i];
        }
    }

    this.channels = new ChannelsList(obj.channels || {});
    this.channels.container(this.container());
};

/**
 * Add or updates a channel. This function handles multiple arguments, eg.
 *
 * - addChannel(name, channel)
 * - addChannel(name, unit, type, value)
 *
 * @param {String} name Name of the channel
 * @param {String|Object} channel|unit Channel object (or unit value, when arguments count is >= 3)
 * @param {String} type Type of value
 *
 * @return {Stream} The current stream
 * */
Stream.prototype.addChannel = function (name, channel, a3, a4) {

    if(arguments.length >= 3) {
        name = arguments[0];
        channel = {
            "unit": arguments[1],
            "type": arguments[2]
        };
    }

    this.channels.add(name, channel);

    return this;
};

/**
 * Add or updates a list of channels
 *
 * @param {Object} channels List of channels
 *
 * @return {Stream} The current stream
 * */
Stream.prototype.addChannels = function (channels) {
    this.channels.add(channels);
    return this;
};

/**
 * @return {ChannelsList} The list of channels
 */
Stream.prototype.channels = Stream.prototype.getChannels = function () {
    return this.channels;
};

/**
 * @param {String} name The channel name
 * @return {Object} The requested channel or null if not available
 */
Stream.prototype.channel = Stream.prototype.getChannel = function (name) {

    var c = this.channels.get(name);
    if(c) {
        return c;
    }

    throw new ComposeError("Channel not found");
};

/*
 *
 * @param {boolean} asString Return as string if true, object otherwise
 * @returns {Object|String}
 */
Stream.prototype.toJson = Stream.prototype.toJSON = function (asString) {

    var json = {};

    copyVal(this, json);
    json.channels = this.channels.toJson();

    return asString ? JSON.stringify(json) : json;
};

Stream.prototype.toString = function () {
    return this.toJson(true);
};

/**
 * Creates a WebObject instance
 */
var WebObject = function (objdef) {

    var me = this;

    this.properties = [];
    this.customFields = {};

    if(this instanceof WebObject) {
        this.initialize(objdef);
    }
};

WebObject.prototype.__$streams = null;
WebObject.prototype.__$actions = null;

/**
 * Take an object and set the fields defining the WO accordingly
 * This method will overwrite any previous information
 *
 * Minimum information required are
 * `{ properties: { name: "<wo name>", id: "<wo id>" } }`
 *
 * @param {Object} obj An object with the definition of the WO.
 * @return {WebObject} A webobject instace
 */
WebObject.prototype.initialize = function (obj) {

    obj = obj || {};

    if(typeof obj === 'string') {
        try {
            obj = JSON.parse(obj);
        } catch(e) {
            throw new ComposeError("Object definition cannot be parsed");
        }
    }

    for(var i in obj) {
        if(typeof obj[i] !== 'function') {
            this[i] = obj[i];
        }
    }

    this.customFields = obj.customFields || {};
    this.properties = obj.properties || [];

    this.setStreams(copyVal(obj.streams || {}));
    this.setActions(copyVal(obj.actions || {}));

    return this;
};

WebObject.prototype.getStreams = WebObject.prototype.streams = function () {
    return this.__$streams;
};

/**
 *
 */
WebObject.prototype.setStreams = function (streams) {
    var _streams = new StreamList(streams);
    _streams.container(this);
    this.__$streams = _streams;
};

/**
 *
 * @param {String} name The stream name
 * @return {Object} The Streamobject
 */
WebObject.prototype.stream = WebObject.prototype.getStream = function (name) {

    var s = this.getStreams().get(name);
    if(s) {
        return s;
    }

    throw new ComposeError("Stream not found");
};


WebObject.prototype.actions = WebObject.prototype.getActions = function () {
    return this.__$actions;
};

/**
 *
 * @param {Object} actions
 * @returns {WebObject} self reference
 */
WebObject.prototype.setActions = function (actions) {
    this.__$actions = new compose.util.List.ArrayList(actions);
    this.__$actions.container(this);
    return this;
};

/**
 * @param {String} name The action name
 * @return {Object} The Action object
 */
WebObject.prototype.action = WebObject.prototype.getAction = function (name) {

    var a = this.getActions().get(name, 'name');
    if(a) {
        return a;
    }

    throw new ComposeError("Action not found");

};

/**
 * @param {Object} key The object name
 * @param {Object} stream The object with stream data
 *
 * @return {Object} The Stream object
 */
WebObject.prototype.addStream = function (key, stream) {
    return this.getStreams().add(key, stream);
};

/**
 * @param {Array} streams List of objects to add
 * @return {WebObject} The WO object
 */
WebObject.prototype.addStreams = function (streams) {
    if(typeof streams === "object") {
        for(var i in streams) {
            this.addStream((typeof parseFloat(i) === 'number') ? streams[i].name : i, streams[i]);
        }
    }
    return this;
};

/**
 * @param {Object} action The object to add
 * @return {Object} The Action object
 */
WebObject.prototype.addAction = function (action) {
    return this.getActions().add(action);
};

/**
 * @param {Array} actions List of objects to add
 * @return {WebObject} The WO object
 */
WebObject.prototype.addActions = function (actions) {
    if(actions instanceof Array) {
        for(var i = 0; i < actions.length; i++) {
            this.getActions().add(actions[i]);
        }
    }
    return this;
};

/*
 *
 * @param {boolean} asString Return as string if true, object otherwise
 * @returns {Object|String}
 */
WebObject.prototype.toJson = WebObject.prototype.toJSON = function (asString) {
    var json = {};

    for(var i in this) {
        if(typeof this[i] !== 'function' && i.substr(0, 3) !== '__$') {
            if(this[i] !== null) {
                json[i] = this[i];
            }
        }
    }

    var streams = this.getStreams();
    json.streams = streams ? streams.toJson() : {};

    var actions = this.getActions();
    json.actions = actions ? actions.toJson() : [];

    return asString ? JSON.stringify(json, null) : json;
};

WebObject.prototype.toString = function () {
    return this.toJson(true);
};

/**
 * StreamList class
 */
wolib.StreamList = StreamList;

/**
 * Stream class
 */
wolib.Stream = Stream;

/**
 * WebObject class
 */
wolib.WebObject = WebObject;

/**
 * Creates a new instance of a WebObject
 *
 * @param {Object} wo An object with WebObject properties
 */
wolib.create = function (wo) {
    return new WebObject(wo || {});
};

//    // read a json file by name @todo need to be ported and adapted
//    wolib.read = function(name) {
//        var platform = getPlatformImpl();
//        var content = platform.readFile(name, { definitionsPath: getDefinitionPath() });
//        return content ? JSON.parse(content) : {};
//    };
