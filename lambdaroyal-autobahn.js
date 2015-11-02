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
      /**gets called when the global state changes*/
      stateCallback: function(state) {
        console.log("[autobahn] transiate to state " + state);
      }
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

    this.initData = access({sessionId: this.sessionId}, this.sendInitData.bind(this));

    this.promises = new Map();

    this.resolvePromise = function(evt) {
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
            promise.resolve(data);
            
          }
          return true;
        }
      }
      return false;
    };

    this.timeoutPromise = function(lease) {
      var promise = this.promises.get(lease);
      if(promise) {
        this.promises.delete(lease);
        promise.reject(Error("failed to receive data for lease " + lease + " in time"))
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
        console.log("[autobahn] receive close on websocket: " + evt);
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
        console.log("[autobahn] receive message on websocket: " + evt);
      }
      if(!this.resolvePromise(evt)) {
        //do some async stuff
      }
    }

    this.initWebsocket = function() {
      //transiate global state 
      if(this.state() === States.OUTOFSERVICE) this.state(States.CLOSED);
      try {
        if(this.debug) {
          console.log("[autobahn] init websocket to " + this.url);
        }
        var ws = new WebSocket(this.url);
        this.registerWebsocket(ws);

        ws.onopen = this.onopenWebsocket.bind(this, ws);
        ws.onclose = this.oncloseWebsocket.bind(this, ws);        
        ws.onerror = this.onerrorWebsocket.bind(this, ws);
        ws.onmessage = this.onmessageWebsocket.bind(this, ws);
      } catch(e) {
        console.log("Failed to instantiate websocket for URL " + this.url + " due to error: " + e);
      }
    }

    this.mtn = function() {
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
    }

    this.mtn();
    this.mtnTimer = setInterval(this.mtn.bind(this), this.maintainanceInterval);

    this.close = function() {
      this.mtnTimer = clearInterval(mtnTimer);
      //keep those that are connected
      this.websockets = this.websockets.filter(function(n) {
        return n.state() === WebSocket.CONNECTING | n.state() === WebSocket.OPEN;
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
          this.reject(Error("failed to send data in sync mode - autobahn is closed."));
          return;
        }

        //register the promise
        autobahn.promises.set(lease, {resolve: resolve, reject: reject});

      });

      var promiseWrapper = this.promises.get(lease);
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
        data = JSON.stringify({lease: lease, data: data});  
        ws.send(data);
      } catch(e) {
        this.promises.delete(lease);
        promise.reject(Error("failed to send data in sync mode - protocol error: " + e));
      }
      
      //init timeout
      timer = setTimeout(this.timeoutPromise.bind(autobahn, lease), timeout ? timeout : this.syncTimeout);

      promiseWrapper.timer = timer;
      return promise;      
    };
  }
  return Autobahn;
});
