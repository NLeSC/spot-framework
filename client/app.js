var app = require('ampersand-app');
var Router = require('./router');
var MainView = require('./views/main');
var Me = require('./models/me');
var domReady = require('domready');
var widgetFactory = require('./widget_factory');
var crossfilter = require('crossfilter');
var d3 = require('d3');

var CSS = require('./app.css');

// FIXME: i can't get the componentHandler exported via browserify-shim
// the require below will add it as window.componentHandler
var mdl = require('mdl'); 

// attach our app to `window` so we can
// easily access it from the console.
window.app = app;

// Extends our main app singleton
app.extend({
    me: new Me(),
    crossfilter: crossfilter([]),
    widgetFactory: widgetFactory,
    router: new Router(),

    // This is where it all starts
    init: function() {

        // Load the actual data, and add it to the crossfilter when ready
        d3.json('./data/data.json', function (error,json) {

            window.app.crossfilter.add(json);

            d3.json('./data/session.json', function (error,json) {
                window.app.me.set(json);
            }); 

        });

        // Create and attach our main view
        this.mainView = new MainView({
            model: this.me,
            el: document.body
        });

        // this kicks off our backbutton tracking (browser history)
        // and will cause the first matching handler in the router
        // to fire.
        this.router.history.start({ pushState: true });

    },
    // This is a helper for navigating around the app.
    // this gets called by a global click handler that handles
    // all the <a> tags in the app.
    // it expects a url pathname for example: "/costello/settings"
    navigate: function(page) {
        var url = (page.charAt(0) === '/') ? page.slice(1) : page;
        this.router.history.navigate(url, {
            trigger: true
        });
    }
});

// run it on domReady
domReady(function() {
    app.init.call(app);
});
