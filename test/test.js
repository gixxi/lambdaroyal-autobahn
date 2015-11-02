QUnit.test( "testing lambdaroyal-autobahn, sync, plain vanilla", function( assert ) {
  var done = assert.async(1);
  var autobahn = new Autobahn("ws://echo.websocket.org", {stateCallback: function(state) {
    console.log("[custom autobahn] transiate to state " + state);
    if(state === this.States.OPEN) {
      autobahn.sync("foo").then(function(data) {
        console.log("received message in time: " + data);
        assert.ok(data.lease !== undefined);
        assert.equal(data.data,"foo");
        assert.equal(autobahn.promises.size, 0, "lease queue must be empty");
        assert.equal(autobahn.state(), autobahn.States.OPEN);
        done();

      });
    }
  }});
  setTimeout(function() {
  }, 1000);

  //close the autobahn
  autobahn.close();
  done = assert.async(1);
  setTimeout(function() {
    assert.equal(autobahn.state(), autobahn.States.OUTOFSERVICE);
    done();
  }, 1000);


  //init 4 connections and send off 100 incs
  var acc = 0;
  var done = assert.async(1);
  var autobahn = new Autobahn("ws://echo.websocket.org", {lanes: 4, stateCallback: function(state) {
    console.log("[custom autobahn " + autobahn.sessionId + "] transiate to state " + state);
    if(state === this.States.OPEN) {
      for(var i = 0; i < 10; i++) {
        autobahn.sync(1).then(function(data) {
          acc = acc + data.data;
        });
      }
    }
  }});

  //close the autobahn
  autobahn.close();
  done = assert.async(1);
  setTimeout(function() {
    assert.equal(autobahn.state(), autobahn.States.OUTOFSERVICE);
    assert.equal(acc, 100);
    done();
  }, 2000);
});
