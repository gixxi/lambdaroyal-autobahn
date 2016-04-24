# lambdaroyal-autobahn
holy javascript client/server communication over websockets (sync/async/timed/publish/subscribed/multichan)

It *feels like doing ordinary XMLHttpRequest* and getting back a promise that resolves or gets rejected. But under the hood you get a configurable number of websockets providing your application with much less overhead in terms of connection handshake.

Furthermore one can send-off messages using a *topic* and receive answers to the topics by observers to come up with a more *loosely coupled* application architecture.

## Light-weight

* Only 2KB gzipped
* Small API, easy to grasp
* no-trap in, can be used with other libs in conjunction

## How to use

### Install

```
bower install lambdaroyal-autobahn
```

### Initialize

One websocket, no callbacks on state transitions

```Javascript
var autobahn = new Autobahn("ws://echo.websocket.org");
```

Or a bit more elaborated - four websockets, callback for global transitions changes and check for dead-ends every 500ms

```Javascript
var autobahn = new Autobahn("ws://echo.websocket.org", {lanes: 4, maintainanceInterval: 500, stateCallback: function(state) {
    console.log("[autobahn] transiate to state " + state);
}})
```

### Synchronous call

```Javascript
autobahn.sync("foo").then(function(data) {
  console.log("received message in time: " + data);
});
```

### Synchronous call with error forwarding

```Javascript
  autobahn.sync("foo")
  .then(function(data) {
    console.log("received message in time: " + data);
  })
  .catch(function(msg) {
    console.log("uups");
  });
```

### Async publishing

to a topic named _foo_

```Javascript
autobahn.async("foo",1)
```

### Subscribing

to all incoming messages to a topic named _foo_

```Javascript
autobahn.sub("foo", function(data) {
    console.log("received message on topic foo: " + data);
});
```

### Shut-down

closes all open websockets

```Javascript
autobahn.close();
```

### Init parameters

init parameters are provided to the new instance as a Javascript Map. The following ones are considered:

* **debug** (true) log debug messages to browser console
* **syncTimeout** (2000) timeout (ms) related to sync calls
* **lanes** (1) number of parallel websocket to be opened, actual max. number is browser-dependend
* **reconnectInterval** (1000) The number of milliseconds to delay before attempting to reconnect after a close event. */
* **maintainanceInterval** (2000) The number of milliseconds between two maintainance cycles where closed sockets are dumped and new sockets are established
* **protocols** ("vlic") name(s) of the protocol used to initialize individual websockets
* **syncErrorCallback** gets called when sync timeout occcures, can be used to inform log servers to get some failure stats. The lease (unique string representing the request) is passed to this function
* **stateCallback** gets called when the global state changes
* **exceptionCallback** gets called when an uncatched exception occurs during maintenance phase or when opening a websocket that would otherwise only result in a console log. the error message is passed to the function
* **statsOnSyncResponse** gets called when responses on sync comm requests are received, accepts parameters ws and delay. [ws] denotes the websocket instance the response came in, [delay] denotes time in ms since request was spawned or undefined for responses that arrived after timeout
* **syncStarts** (undefined) global callback that gets invoked right before a sync call is attempted to be sent via some websocket, the function can accept the request body as parameter
* **syncStops** (undefined) global callback that gets invoked right after a sync call resolves or is rejected, the function can accept success as first and the response body as second parameter
