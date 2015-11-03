# lambdaroyal-autobahn
holy javascript client/server communication over websockets (sync/async/timed/publish/subscribed/multichan)

It *feels like doing ordinary XMLHttpRequest* and getting back a promise that resolves or gets rejected. But under the hood you get a configurable number of websockets providing your application with much less overhead in terms of connection handshake.

Furthermore one can send-off messages using a *topic* and receive answers to the topics by observers to come up with a more *loosely coupled* application architecture.

## Light-weight

* Only 2KB gzipped
* Small API, easy to grasp
* no-trap in, can be used with other libs in conjunction

## How to use

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
