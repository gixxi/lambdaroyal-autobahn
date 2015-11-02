QUnit.test( "hello test", function( assert ) {
  var autobahn = new Autobahn("ws://echo.websocket.org", {stateCallback: function(state) {
    console.log("[custom autobahn] transiate to state " + state);
    if(state === this.States.OPEN) {
      autobahn.sync("foo").then(function(data) {
        assert.ok( "foo" === data);
      });
    }
  }});
  assert.ok( 1 == "1", "Passed!" );
});
