/**
 * Main spot object.
 *
 * @class Spot
 */
var BaseModel = require('./util/base');
var Dataview = require('./dataview');
var Datasets = require('./dataset/collection');
var driverClient = require('./driver/client');
var driverServer = require('./driver/server');
var utildx = require('./util/crossfilter');
var timeUtil = require('./util/time');
var io = require('socket.io-client');

/**
 * Connect to the spot-server using a websocket and setup callbacks
 *
 * @function
 * @param {address} Optional. IP address and port number to connect to. fi.  'http://localhost:3000'
 *
 * @memberof! Spot
 */
function connectToServer (address) {
  var me = this;
  var socket;

  if (address) {
    // connect to specified address
    // necessary for when window.location is not availble (node.js)
    socket = io.connect(address);
  } else {
    // Use socket.io fallback to autodetect address
    // ie. when a website wants to connect, use the window.location
    socket = io.connect();
  }

  socket.on('connect', function () {
    me.isConnected = true;
    console.log('Connected to server');
  });

  socket.on('disconnect', function () {
    me.isConnected = false;
  });

  socket.on('syncDatasets', function (req) {
    // do an incremental update, as we typically start without datasets
    me.datasets.add(req.data, { merge: true });
  });

  socket.on('syncDataview', function (req) {
    me.dataview.reset(req.data);
  });

  socket.on('syncFacets', function (req) {
    // do an incremental update, as we typically update only a few properties of a facet
    // Also, a full reset will orphan the view.model objects in spot-app (ie. crashes)
    var dataset = me.datasets.get(req.datasetId);
    dataset.facets.add(req.data, { merge: true });

    me.resetDataview(); // NOTE: the cached (serialized) datasets need to be updated, too

    dataset.trigger('syncFacets');
  });

  socket.on('newData', function (req) {
    var filter = me.dataview.filters.get(req.filterId);
    if (req.data) {
      filter.data = req.data;

      // for text filters, rebuild partition and count
      filter.partitions.forEach(function (partition, p) {
        var columnToName = {1: 'a', 2: 'b', 3: 'c', 4: 'd'};

        if (partition.isText) {
          partition.groups.reset(null, {silent: true});
          filter.data.forEach(function (d) {
            var count = (parseFloat(d.aa) || parseInt(d.count)) || 0;

            if (count) {
              partition.groups.add({
                min: 0,
                max: 100,
                count: count,
                label: d[columnToName[(p + 1)]],
                value: d[columnToName[(p + 1)]]
              }, {silent: true});
            }
          });
          partition.groups.sort();
        }
      });
      filter.trigger('newData');
    }
  });

  socket.on('newMetaData', function (req) {
    me.dataview.dataTotal = parseInt(req.dataTotal);
    me.dataview.dataSelected = parseInt(req.dataSelected);
    console.timeEnd('Get data');
    me.dataview.trigger('newMetaData');
  });

  socket.connect();
  me.socket = socket;
}

/**
 * Disconnect from the spot-server
 *
 * @function
 * @memberof! Spot
 */
function disconnectFromServer () {
  this.socket.disconnect();
}

/**
 * Request a list of available datasets from the server
 *
 * Depending on the driver, this can be an asyncrhonous function.
 * It returns a Promise that resolves to the dataset collection
 *
 * @function
 * @returns {Promise}
 *
 * @memberof! Spot
 */
function getDatasets () {
  var me = this;

  return new Promise(function (resolve, reject) {
    me.socket.emit('getDatasets');

    me.datasets.once('reset', function () {
      resolve(me.datasets);
    });
  });
}

/**
 * Reset min, max, and categories for all facets in the dataview
 *
 * @param {Spot} me Main spot instance
 *
 * @memberof! Spot
 */
function resetDataview () {
  var toSerialize = [];

  // Update list of active datasets, and serialize the datasets parts we need to send on getData requests
  this.dataview.datasetIds = [];
  this.datasets.forEach(function (dataset) {
    if (dataset.isActive) {
      // BUGFIX: the list of datasetIds can get out of sync when using spot-server. Just recreate it always.
      this.dataview.datasetIds.push(dataset.getId());
      toSerialize.push(dataset.toJSON()); // TODO: only serialize used facets?
    }
  }, this);
  this.cachedDatasets = JSON.stringify(toSerialize);

  // rescan min/max values and categories for the newly added facets
  this.dataview.facets.forEach(function (facet) {
    var newFacet = this.dataview.facets.get(facet.name, 'name');

    if (newFacet.isContinuous || newFacet.isDatetime || newFacet.isDuration) {
      this.setFacetMinMax(facet);
    } else if (newFacet.isCategorial) {
      this.setFacetCategories(facet);
    }
  }, this);
}

/*
 * Add or remove facets from a dataset to the global (merged) dataset
 *
 * @memberof! Spot
 * @param {Spot} me Main spot instance
 * @param {Dataset} dataset Dataset set add or remove
 */
function toggleDatasetFacets (me, dataset) {
  if (dataset.isActive) {
    // remove active facets in dataset from the global dataset...
    dataset.facets.forEach(function (facet) {
      if (!facet.isActive) {
        return;
      }

      // ...but only when no other active dataset contains it
      var facetIsUnique = true;
      me.datasets.forEach(function (otherDataset) {
        if (!otherDataset.isActive || otherDataset === dataset) {
          return;
        }
        if (otherDataset.facets.get(facet.name, 'name')) {
          facetIsUnique = false;
        }
      });
      if (facetIsUnique) {
        var toRemove = me.dataview.facets.get(facet.name, 'name');
        me.dataview.facets.remove(toRemove);
      }
    });
  } else if (!dataset.isActive) {
    // copy facets
    dataset.facets.forEach(function (facet) {
      // do nothing if facet is not active
      if (!facet.isActive) {
        return;
      }

      // default options for all facet types
      var options = {
        name: facet.name,
        accessor: facet.name,
        description: facet.description,
        type: facet.transform.transformedType,
        units: facet.units, // TODO: transformed units?
        isActive: true
      };

      // do not add if a similar facet already exists
      if (!me.dataview.facets.get(facet.name, 'name')) {
        me.dataview.facets.add(options);
      }
    });
  }
}

/*
 * Add or remove data from a dataset to the global (merged) dataset
 *
 * @memberof! Spot
 * @param {Spot} me Main spot instance
 * @param {Dataset} dataset Dataset set add or remove
 */
function toggleDatasetData (me, dataset) {
  if (dataset.isActive) {
    // if dataset is active, remove it:
    // ...clear all crossfilter filters
    me.dataview.filters.forEach(function (filter) {
      // BUGFIX: when loading sessions, the dataset is not initialized properly
      // so check for it to be sure
      if (filter.dimension) {
        filter.dimension.filterAll();
      }
    });

    // ...filter all data, originating from the dataset from the dataset
    var dimension = me.dataview.crossfilter.dimension(function (d) {
      return d._OriginalDatasetId;
    });
    dimension.filter(dataset.getId());

    // ...remove matching data
    me.dataview.crossfilter.remove();

    // ...restore original filters
    dimension.filterAll();
    dimension.dispose();
    me.dataview.filters.forEach(function (filter) {
      filter.updateDataFilter();
    });
  } else if (!dataset.isActive) {
    // if dataset is not active, add it
    // ...find facets to copy
    var dataTransforms = [];
    dataset.facets.forEach(function (facet) {
      // do nothing if facet is not active
      if (!facet.isActive) {
        return;
      }
      dataTransforms.push({
        key: facet.name,
        fn: utildx.valueFn(facet)
      });
    });

    // ...transform data
    var data = dataset.data;
    var transformedData = [];

    data.forEach(function (datum) {
      var transformedDatum = {};
      dataTransforms.forEach(function (transform) {
        transformedDatum[transform.key] = transform.fn(datum);
      });
      transformedDatum._OriginalDatasetId = dataset.getId();
      transformedData.push(transformedDatum);
    });

    // ...add to merged dataset
    me.dataview.crossfilter.add(transformedData);
  }

  // update counts
  me.dataview.dataTotal = me.dataview.crossfilter.size();
  me.dataview.dataSelected = me.dataview.countGroup.value();
}

/**
 * Add or remove a dataset from the dataview
 * @param {Dataset} dataset Dataset set add or remove
 *
 * @function
 * @memberof! Spot
 */
function toggleDataset (dataset) {
  if (this.sessionType === 'server') {
    toggleDatasetFacets(this, dataset);
  } else if (this.sessionType === 'client') {
    // release all filters
    this.dataview.filters.forEach(function (filter) {
      filter.releaseDataFilter();
    });

    // manually merge the datasets
    toggleDatasetFacets(this, dataset);
    toggleDatasetData(this, dataset);
  }

  dataset.isActive = !dataset.isActive;

  this.resetDataview();
}

function setFacetMinMax (facet) {
  // This should work for all kinds of facets:
  // numbers, durations, and datatimes all implement the relevant operations
  var datasets = this.datasets;

  var first = true;
  datasets.forEach(function (dataset) {
    if (dataset.isActive) {
      var subFacet = dataset.facets.get(facet.name, 'name');
      if (first) {
        facet.minvalAsText = subFacet.transform.transformedMinAsText;
        facet.maxvalAsText = subFacet.transform.transformedMaxAsText;
        first = false;
      } else {
        if (subFacet.minval < facet.minval) {
          facet.minvalAsText = subFacet.transform.transformedMinAsText;
        }
        if (subFacet.maxval > facet.maxval) {
          facet.maxvalAsText = subFacet.transform.transformedMaxAsText;
        }
      }
    }
  });
}

function setFacetCategories (facet) {
  var datasets = this.datasets;

  facet.categorialTransform.reset();

  // get categories by combining the sets for the separate datasets
  datasets.forEach(function (dataset) {
    if (dataset.isActive) {
      var subFacet = dataset.facets.get(facet.name, 'name');

      if (subFacet.isCategorial) {
        // merge rules from subFacet into those of Facet
        subFacet.categorialTransform.rules.forEach(function (rule) {
          var newRule = facet.categorialTransform.rules.get(rule.expression, 'expression');
          if (newRule) {
            newRule.count += rule.count;
          } else {
            facet.categorialTransform.rules.add(rule.toJSON());
          }
        });
      } else if (subFacet.isDatetime) {
        var expressions = timeUtil.timeParts.get(subFacet.datetimeTransform.transformedFormat, 'description').groups;
        expressions.forEach(function (expression) {
          var newRule = facet.categorialTransform.rules.get(expression, 'expression');
          if (newRule) {
            // no-op: category exist and we don't have a proper count
          } else {
            facet.categorialTransform.rules.add({
              expression: expression,
              count: 0,
              group: expression
            });
          }
        });
      }
    }
  });
}

module.exports = BaseModel.extend({
  type: 'user',
  props: {
    /**
     * Is there a connection with a spot sever?
     * @memberof! Spot
     * @type {boolean}
     */
    isConnected: ['boolean', true, false],
    /**
     * When the app in locked down, facets and datasets cannot be edited
     * @memberof! Spot
     * @type {boolean}
     */
    isLockedDown: ['boolean', true, false],
    /**
     * Type of spot session. Must be 'client' or 'server'
     * @memberof! Spot
     * @type {string}
     */
    sessionType: {
      type: 'string',
      required: true,
      default: 'client',
      values: ['client', 'server'],
      setOnce: true
    }
  },
  children: {
    /**
     * A union of all active datasets
     * @memberof! Spot
     * @type {Dataview}
     */
    dataview: Dataview
  },
  collections: {
    /**
     * Collection of all datasets
     * @memberof! Spot
     * @type {Dataset[]}
     */
    datasets: Datasets
  },
  initialize: function () {
    // first do parent class initialization
    BaseModel.prototype.initialize.apply(this, arguments);

    // default to client side (crossfilter) sessions
    this.driver = driverClient;

    // assign backend driver
    if (arguments && arguments[0] && arguments[0].sessionType) {
      if (arguments[0].sessionType === 'client') {
        this.driver = driverClient;
      } else if (arguments[0].sessionType === 'server') {
        this.driver = driverServer;
      } else {
        console.error('No driver for type', arguments[0].sessionType);
      }
    }
  },
  resetDataview: resetDataview,
  connectToServer: connectToServer,
  disconnectFromServer: disconnectFromServer,
  getDatasets: getDatasets,
  setFacetMinMax: setFacetMinMax,
  setFacetCategories: setFacetCategories,
  toggleDataset: toggleDataset
});

module.exports.util = {
  dx: utildx,
  misval: require('./util/misval'),
  time: timeUtil
};

module.exports.transforms = {
  categorial: require('./facet/categorial-transform'),
  continuous: require('./facet/continuous-transform'),
  datetime: require('./facet/datetime-transform'),
  duration: require('./facet/duration-transform')
};

module.exports.constructors = {
  Dataview: Dataview,
  Dataset: require('./dataset'),
  Datasets: Datasets
};
