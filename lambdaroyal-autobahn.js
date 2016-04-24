(function (global, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module !== 'undefined' && module.exports){
    module.exports = factory();
  } else {
    global.Autobahn = factory();
  }
})(this, function () {

  //if (!('WebSocket' in window)) {
  //  return;
  //}


  ///////////////////////////////////////////////////////////////
  // helper functions
  ///////////////////////////////////////////////////////////////

  var makeid = function() {
    var xs = [];
    var def = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 10; i++ )
      xs.push(def.charAt(Math.floor(Math.random() * def.length)));

    return xs.join("");
  };

  var _id = (function(store) {
    var prop = function() {
      if(arguments.length) {
        store = arguments[0];
      } else {
       	store = store + 1;   
      }
      return store;
    }
    return prop;
  })(0);

  var access = function(store, callback) {
    var prop = function() {
      if (arguments.length) {
        store = arguments[0];
        if(callback) {
          callback(store);
        }}
      return store;
    };

    prop.toJSON = function() {
      return store;
    };

    return prop;
  };
  
  //////////////////////////////////////////////////////////////
  // easy message bus
  //////////////////////////////////////////////////////////////
  var Mbus = function() {
    //maps topics to function wrappers
    this.topics = new Map();

    /** returns a unique identifier for this observer related to the topic.
        use this identifier to unsubscribe from the topic */
    this.sub = function(topic, lambda) {
      var observers = this.topics.get(topic);
      if(observers === undefined) {
        observers = new Map();
        this.topics.set(topic, observers);
      }

      var lambdaid = _id();
      observers.set(lambdaid, lambda);
      return lambdaid;
    }

    /** desubscribe from a topic, lambdaid denotes the unique identifier of the observer */
    this.desub = function(topic, lambdaid) {
      var observers = this.topics.get(topic);
      if(observers !== undefined) {
        observers.delete(lambdaid);
        if(observers.size == 0) {
          this.topics.delete(topic);
        }
      }
    }

    /** notify all observers of a certain topic on the msg */
    this.pub = function(topic, msg) {
      var observers = this.topics.get(topic);
      if(observers !== undefined) {
        observers.forEach(function(v,k) {
          try {
            v(msg);
          } catch(e) {}
        });
      }
    }
  }

  //////////////////////////////////////////////////////////////
  // the one and only
  //////////////////////////////////////////////////////////////

  var Autobahn = function(url, options) {
    // Default settings
    var States = Object.freeze({
      "OUTOFSERVICE":0,
      "CLOSED":1,
      "OPEN":2
    });

    this.States = States;

    var settings = {

      /** log debug messages. */
      debug: true,
      /** timeout related to sync calls */
      syncTimeout: 2000,
      /** number of parallel websocket to be opened*/
      lanes: 1,
      /** The number of milliseconds to delay before attempting to reconnect after a close event. */
      reconnectInterval: 1000,
      /** The number of milliseconds between two maintainance cycles where closed sockets are dumped and new sockets are established*/
      maintainanceInterval: 2000,
      /**name(s) of the protocol used to initialize individual websockets*/
      protocols: "vlic",
      /**
       * global callback that gets invoked right before a sync call is attempted to be sent via some websocket, the function can accept the request body as parameter
       */
      syncStarts: undefined,
      /**
       * global callback that gets invoked right after a sync call resolves or is rejected, the function can accept success as first and the response body as second parameter
       */
      syncStops: undefined,
      /**gets called when sync timeout occcures, can be used to inform log servers to get some failure stats*/
      syncErrorCallback: function(lease) {
        
      },
      /**gets called when the global state changes*/
      stateCallback: function(state) {
        console.log("[autobahn " + this.sessionId + "] transiate to state " + state);
      },
      /**gets called when an uncatched exception occurs during maintenance phase or when opening a websocket that would otherwise only result in a console log.*/
      exceptionCallback: function(err) {
        console.log("uncatched exception occured: " + err);
      },
      /**gets called when responses on sync comm requests are received, [ws] denotes the websocket instance the response came in, [delay] denotes time in ms since request was spawned or undefined for responses that arrived after timeout*/
      statsOnSyncResponse: function(ws, delay) {}
    }
    if (!options) { options = {}; }

    // Overwrite and define settings with options if they exist.
    for (var key in settings) {
      if (typeof options[key] !== 'undefined') {
        this[key] = options[key];
      } else {
        this[key] = settings[key];
      }
    }

    // these should be treated as read-only properties

    /**
     * message bus for fan-out messaging
     */
    this.mbus = new Mbus();

    /** The URL as resolved by the constructor. This is always an absolute URL. Read only. */
    this.url = url;

    /**
       denotes a unique (hopefully) id this autobahn instance can send to the server in order to allow the server to distinguish between different autobahn instances*/
    this.sessionId = makeid();

    /** global state*/       
    this.state = access(States.OUTOFSERVICE, this.stateCallback.bind(this));

    /** Contains all websockets, websockets register themself using register websocket, this list is frequently maintained by a timer*/
    this.websockets = [];

    this.registerWebsocket = function(ws) {
      ws["lane"] = this.websockets.length;
      this.websockets.push(ws);
    }

    this.sendInitData = function(data) {
      if(data !== null) {
        this.websockets.filter(function(ws) { return ws.readyState === WebSocket.OPEN}).map(function(ws) {
          try {
            if(data && typeof data !== "string") {
              data = JSON.stringify(data);
            }
            ws.send(data);
          } catch (e) {
            console.log("Error sending init data to websocket due to: " + e)
          }
        });
      }
    } 

    //we send-in the number of lanes to allow the server to kill-off broken daemon lanes from server side 
    this.initData = access({sessionId: this.sessionId, lanes: this.lanes}, this.sendInitData.bind(this));

    this.promises = new Map();

    this.resolvePromise = function(ws, evt) {
      if(evt.data !== undefined) {
        var data = evt.data;
        
        if(data && typeof data === "string") {
          data = JSON.parse(data);
        }
        var lease = data["lease"];
        if(lease !== undefined) {
          var promise = this.promises.get(lease);
          if(promise) {
            clearTimeout(promise.timer);
            this.promises.delete(lease);
            try {
              promise.resolve(data);
            } finally {
              if(this.statsOnSyncResponse) {
                this.statsOnSyncResponse(ws, (+new Date) - promise.start);
              }
              if(this.syncStops) {
                try {
                  this.syncStops(true, data);
                } catch(e) {
                  console.log("failed to invoke syncStops: " + e);
                }
              }
            }
          } else {
            //most propably timeout
            if(this.statsOnSyncResponse) {
              this.statsOnSyncResponse(ws, undefined);
            }

          }
          return true;
        }
      }
      return false;
    };
    
    /** checks whether the incoming data contains a topic, notifies all subscribing observers */
    this.pub = function(evt) {
      if(evt.data !== undefined) {
        var data = evt.data;
        
        if(data && typeof data === "string") {
          data = JSON.parse(data);
        }
        var topic = data["topic"];
        if(topic !== undefined) {
          this.mbus.pub(topic, data);
          return true;
        }
      }
      return false      
    }

    this.timeoutPromise = function(lease) {
      var promise = this.promises.get(lease);
      if(promise) {
        this.promises.delete(lease);

        if(this.syncStops) {
          try {
            this.syncStops(false, lease);
          } catch(e) {
            console.log("failed to invoke syncStops: " + e);
          }
        }

        if(this.syncErrorCallback) {
          this.syncErrorCallback(lease);
        }
        promise.reject(Error("failed to receive data for lease " + lease + " in time"));
      }      
    };

    this.onopenWebsocket = function(ws, evt) {
      if(this.state() === States.CLOSED) this.state(States.OPEN);
      if(this.initData() !== null) {
        try {
          var data = this.initData();
          if(data && typeof data !== "string") {
            data = JSON.stringify(data);
          }

          ws.send(data);
        } catch (e) {
          console.log("Error sending init data to websocket due to: " + e)
        }
      }          
    }

    this.oncloseWebsocket = function(ws, evt) {
      if(this.debug) {
        console.log("[autobahn " + this.sessionId + "] receive close on websocket: " + evt);
      }
      if(this.websockets.filter(function(n) {
        return n.readyState === WebSocket.CONNECTING | n.readyState === WebSocket.OPEN;
      }).length == 0) {
        if(this.state() !== States.OUTOFSERVICE) {
          this.state(States.CLOSED);
        }
      }
    }

    this.onerrorWebsocket = function(ws, evt) {
      if(this.debug) {
        console.log("[autobahn] receive error on websocket: " + evt);
      }
    }
    this.onmessageWebsocket = function(ws, evt) {
      if(this.debug) {
        console.log("[autobahn " + this.sessionId + "] receive message on websocket: " + evt);
      }
      // -> chain of responsibility
      //do some sync stuff
      if(!this.resolvePromise(ws, evt)) {
        //do some async stuff
        this.pub(evt);
      }
    }

    this.initWebsocket = function() {
      //transiate global state 
      if(this.state() === States.OUTOFSERVICE) this.state(States.CLOSED);
      try {
        if(this.debug) {
          console.log("[autobahn " + this.sessionId + "] init websocket to " + this.url);
        }
        var ws = new WebSocket(this.url);
        this.registerWebsocket(ws);

        ws.onopen = this.onopenWebsocket.bind(this, ws);
        ws.onclose = this.oncloseWebsocket.bind(this, ws);        
        ws.onerror = this.onerrorWebsocket.bind(this, ws);
        ws.onmessage = this.onmessageWebsocket.bind(this, ws);
      } catch(e) {
        console.log("Failed to instantiate websocket for URL " + this.url + " due to error: " + e);
        if(this.exceptionCallback) {
          this.exceptionCallback(e);
        }
      }
    }

    this.mtn = function() {
      try {
        //keep those that are connected
        this.websockets = this.websockets.filter(function(n) {
          return n.readyState === WebSocket.CONNECTING || n.readyState === WebSocket.OPEN;
        });

        //don't waste time on non-avail infrastructure
        if(this.websockets.length < this.lanes) {
          var initJustOne = this.websockets.length == 0;
          for(var i = 0; i < this.lanes - this.websockets.length; i++) {
            this.initWebsocket();
            if(initJustOne) break;
          }
        }
      } catch(err) {
        if(this.exceptionCallback) {
          this.exceptionCallback(err);
        }
      }
    }

    this.mtn();
    this.mtnTimer = setInterval(this.mtn.bind(this), this.maintainanceInterval);

    this.close = function() {
      clearInterval(this.mtnTimer);
      //keep those that are connected
      this.websockets = this.websockets.filter(function(n) {
        return n.readyState === WebSocket.OPEN;
      });

      this.websockets.map(function(n) {
        try {
          n.close(1000, "Autobahn gets closed");
        } catch(e) {
          console.log("failed to close websocket: " + e);
        }
      });

      this.state(States.OUTOFSERVICE);
    };
    

    this.sync = function(data, timeout) {
      //get lease
      var lease = [];
      lease.push(makeid());
      lease.push(_id());
      lease = lease.join("_");

      var autobahn = this;
      var promise = new Promise(function(resolve, reject) {
        //fail fast
        if(autobahn.state() == autobahn.States.CLOSED) {
          reject(Error("failed to send data in sync mode - autobahn is closed."));
        } else {
          //register the promise
          autobahn.promises.set(lease, {resolve: resolve, reject: reject});
        }


      });

      var promiseWrapper = this.promises.get(lease);
      if(promiseWrapper) {

        promiseWrapper.promise = promise;
        

        //get some ws
        var xs = this.websockets.filter(function(x) {
          return x.readyState == WebSocket.OPEN;
        });
        if(xs.length == 0) {
          this.promises.delete(lease);
          promise.reject(Error("failed to send data in sync mode - autobahn is closed."));
        }
        var ws = xs[Math.floor(Math.random() * xs.length)];
        try {

          if(typeof data === "object") {
            data["lease"] = lease;
          } else {
            data = {lease: lease, data: data};
          }

          if(this.syncStarts) {
            try {
              this.syncStarts(data);
            } catch(e) {
              console.log("failed to invoke syncStart: " + e);
            }
          }

          data = JSON.stringify(data);
  
          ws.send(data);
        } catch(e) {
          this.promises.delete(lease);
          promise.reject(Error("failed to send data in sync mode - protocol error: " + e));
        }
        
        //set start POT
        promiseWrapper.start = +new Date;

        //init timeout
        timer = setTimeout(this.timeoutPromise.bind(autobahn, lease), timeout ? timeout : this.syncTimeout);

        promiseWrapper.timer = timer;
      }
      return promise;      
    };

    /**
     * send message related to a topic without getting a promise to receive an answer. incomming messages containing a topic are multiplexed by the message bus in sync manner to all observers.
     *
     * Throws Error if autobahn is in wrong global state or no websocket is currently open
     */
    this.async = function(topic, data) {
      if(this.state() == States.CLOSED) {
        throw Error("failed to send data in async mode - autobahn is closed.");
      }

      //get some ws
      var xs = this.websockets.filter(function(x) {
        return x.readyState == WebSocket.OPEN;
      });
      if(xs.length == 0) {
        throw Error("failed to send data in async mode - autobahn is closed.");
      }
      var ws = xs[Math.floor(Math.random() * xs.length)];
      try {
        data = JSON.stringify({topic: topic, data: data});  
        ws.send(data);
      } catch(e) {
        throw Error("failed to send data in sync mode - protocol error: " + e);
      }
    }

    this.sub = function(topic, lambda) {
      return this.mbus.sub(topic, lambda);
    }

    /** desubscribe from a topic, lambdaid denotes the unique identifier of the observer */
    this.desub = function(topic, lambdaid) {
      this.mbus.desub(topic, lambdaid);
    }

  }
  return Autobahn;
});
