QUnit.test( "testing lambdaroyal-autobahn, sync, plain vanilla", function( assert ) {
  var done = assert.async(2);
  var autobahn = new Autobahn("ws://echo.websocket.org", {stateCallback: function(state) {
    console.log("[custom autobahn] transiate to state " + state);
    if(state === this.States.OPEN) {
      autobahn.sync("foo").then(function(data) {
        console.log("received message in time: " + data);
        assert.ok(data.lease !== undefined);
        assert.equal(data.data,"foo");
        assert.equal(autobahn.promises.size, 0, "lease queue must be empty");
        assert.equal(autobahn.state(), autobahn.States.OPEN);
        
        //close the autobahn
        autobahn.close();
        done();

      });
    }
  }});

  setTimeout(function() {
    assert.equal(autobahn.state(), autobahn.States.OUTOFSERVICE);
    done();
  }, 1000);
});

QUnit.test( "testing lambdaroyal-autobahn, sync, do 100 calls on 4 lanes", function( assert ) {
  //init 4 connections and send off 100 incs
  var acc = 0;
  var done = assert.async(2);
  var autobahn = new Autobahn("ws://echo.websocket.org", {lanes: 4, maintainanceInterval: 100, stateCallback: function(state) {
    console.log("[custom autobahn #2] transiate to state " + state);
    if(state === this.States.OPEN) {
      for(var i = 0; i < 100; i++) {
        autobahn.sync(1).then(function(data) {
          acc = acc + data.data;
        });
      }
    }
  }});

  //

  //close the autobahn
  setTimeout(function() {
    assert.equal(autobahn.websockets.length, 4, "number of websockets must be four");
    autobahn.close();
    done();
  }, 1000);
  
  //check postconditions
  setTimeout(function() {
    assert.equal(autobahn.state(), autobahn.States.OUTOFSERVICE,"autobahn must be out-of-service after close");
    assert.equal(acc, 100, "accumulator must be 100 due to 100 increments");
    done();
  }, 2000);
});

QUnit.test( "testing lambdaroyal-autobahn, sync, negative test on non-open connection", function( assert ) {
  var done = assert.async(3);
  var autobahn = new Autobahn("ws://echo.websocket.org", {stateCallback: function(state) {
    console.log("[custom autobahn] transiate to state " + state);
    if(state === this.States.OPEN) {
      //close the autobahn
      autobahn.close();
      done();
    }}});

  autobahn.sync("foo").catch(function(data) {
    console.log("reject sending message on non-open autobahn");
    done();
  });

  //check postconditions
  setTimeout(function() {
    assert.equal(autobahn.state(), autobahn.States.OUTOFSERVICE,"autobahn must be out-of-service after close");
    done();
  }, 2000);

});

QUnit.test( "testing lambdaroyal-autobahn, async, do 100 calls on 4 lanes", function( assert ) {
  //init 4 connections and send off 100 incs
  var acc = 0;
  var done = assert.async(2);
  var autobahn = new Autobahn("ws://echo.websocket.org", {lanes: 4, maintainanceInterval: 100, stateCallback: function(state) {
    console.log("[custom autobahn #2] transiate to state " + state);
    if(state === this.States.OPEN) {
      //subscribe
      autobahn.sub("foo", function(data) {
        acc = acc + data.data;
        });
      autobahn.sub("boo", function(data) {
        acc = acc + data.data;
        });
      //subscribe and desubscribe to check if garbage gets dumped
      autobahn.desub("boo", autobahn.sub("boo", function(data) {
        acc = acc + data.data;
      }));
      

      for(var i = 0; i < 50; i++) {
        autobahn.async("foo",1);
      }
      for(var i = 0; i < 50; i++) {
        autobahn.async("boo",1);
      }
    }
  }});

  //

  //close the autobahn
  setTimeout(function() {
    assert.equal(autobahn.websockets.length, 4, "number of websockets must be four");
    autobahn.close();
    done();
  }, 1000);
  
  //check postconditions
  setTimeout(function() {
    assert.equal(autobahn.state(), autobahn.States.OUTOFSERVICE,"autobahn must be out-of-service after close");
    assert.equal(acc, 100, "accumulator must be 100 due to 100 increments");
    done();
  }, 2000);
});

