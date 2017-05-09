/**
 * Main spot object.
 *
 * @class Me
 */
var BaseModel = require('./util/base');
var Dataview = require('./dataview');
var Datasets = require('./dataset/collection');
var driverClient = require('./driver/client');
var driverServer = require('./driver/server');
var utildx = require('./util/crossfilter');
var util = require('./util/time');
var socketIO = require('socket.io-client');

/**
 * Connect to the spot-server using a websocket on port 3080 and setup callbacks
 *
 * @function
 * @params {me} me Main spot dataobject
 * @params {string} address URL of server, implicitly uses port 3080.
 */
function connectToServer (me, address) {
  var socket = socketIO(address + ':3080');

  socket.on('connect', function () {
    console.log('spot-server: connected');
    me.isConnected = true;
  });

  socket.on('disconnect', function () {
    console.log('spot-server: disconnected');
    me.isConnected = false;
  });

  socket.on('syncDatasets', function (data) {
    console.log('spot-server: syncDatasets');
    me.datasets.reset(data);
  });

  socket.on('syncDataset', function (data) {
    console.log('spot-server: syncDataset');
    me.dataview.reset(data);
  });

  socket.on('syncFilters', function (data) {
    console.log('spot-server: syncFilters');
    me.dataview.filters.add(data, {merge: true});
  });

  socket.on('syncFacets', function (req) {
    console.log('spot-server: syncFacets');
    var dataset;
    if (req.datasetId === me.dataview.getId()) {
      dataset = me.dataview;
    } else {
      dataset = me.datasets.get(req.datasetId);
    }

    if (dataset && req.data) {
      dataset.facets.add(req.data, {merge: true});
    }
  });

  socket.on('newData', function (req) {
    console.log('spot-server: newData ' + req.filterId);
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
    console.log('spot-server: newMetaData');
    me.dataview.dataTotal = parseInt(req.dataTotal);
    me.dataview.dataSelected = parseInt(req.dataSelected);
  });

  console.log('spot-server: connecting');
  socket.connect();

  me.socket = socket;
}

function setFacetMinMax (datasets, facet) {
  // This should work for all kinds of facets:
  // numbers, durations, and datatimes all implement the relevant operations

  var first = true;
  datasets.forEach(function (dataset) {
    if (dataset.isActive) {
      var subFacet = dataset.facets.get(facet.name, 'name');
      if (first) {
        facet.minvalAsText = subFacet.transform.transformedMin.toString();
        facet.maxvalAsText = subFacet.transform.transformedMax.toString();
        first = false;
      } else {
        if (subFacet.minval < facet.minval) {
          facet.minvalAsText = subFacet.transform.transformedMin.toString();
        }
        if (subFacet.maxval > facet.maxval) {
          facet.maxvalAsText = subFacet.transform.transformedMax.toString();
        }
      }
    }
  });
}

function setFacetCategories (datasets, facet) {
  var categories = {};

  // get categories by combining the sets for the separate datasets
  datasets.forEach(function (dataset) {
    if (dataset.isActive) {
      var subFacet = dataset.facets.get(facet.name, 'name');

      if (subFacet.isCategorial) {
        subFacet.categorialTransform.rules.forEach(function (rule) {
          categories[rule.expression] = rule.group;
        });
      } else if (subFacet.isDatetime) {
        var groups = util.timeParts.get(subFacet.datetimeTransform.transformedFormat, 'description').groups;
        groups.forEach(function (group) {
          categories[group] = group;
        });
      } else {
        console.error('Not implemented');
      }
    }
  });

  facet.categorialTransform.reset();
  Object.keys(categories).forEach(function (cat) {
    facet.categorialTransform.rules.add({
      expression: cat,
      count: 0, // FIXME
      group: categories[cat]
    });
  });
}

/**
 * Reset min, max, and categories for all facets in the dataview
 * @param {Me} me Main spot instance
 */
function resetDataview (me) {
  // rescan min/max values and categories for the newly added facets
  me.dataview.facets.forEach(function (facet) {
    var newFacet = me.dataview.facets.get(facet.name, 'name');

    if (newFacet.isContinuous || newFacet.isDatetime || newFacet.isDuration) {
      setFacetMinMax(me.datasets, facet);
    } else if (newFacet.isCategorial) {
      setFacetCategories(me.datasets, facet);
    }
  });
}

/*
 * Add or remove facets from a dataset to the global (merged) dataset
 * @param {Me} me Main spot instance
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
 * @param {Me} me Main spot instance
 * @param {Dataset} dataset Dataset set add or remove
 */
function toggleDatasetData (me, dataset) {
  if (dataset.isActive) {
    // if dataset is active, remove it:
    // ...clear all crossfilter filters
    this.dataview.filters.forEach(function (filter) {
      // BUGFIX: when loading sessions, the dataset is not initialized properly
      // so check for it to be sure
      if (filter.dimension) {
        filter.dimension.filterAll();
      }
    });

    // ...filter all data, originating from the dataset from the ataset
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
    var data = dataset.crossfilter.all();
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

/*
 * Add or a dataset to the global (merged) dataset
 * @param {Dataset} dataset Dataset set add or remove
 */
function toggleDataset (dataset) {
  var tables = [];

  if (this.isConnected) {
    // for server side datasets, keep track of the database tables

    // 1. all other active datasets
    this.datasets.forEach(function (d) {
      if (d.isActive && d !== dataset) {
        tables.push(d.databaseTable);
      }
    });
    // 2. this dataset
    if (!dataset.isActive) {
      tables.push(dataset.databaseTable);
    }
    this.dataview.databaseTable = tables.join('|');
    toggleDatasetFacets(this, dataset);
  } else {
    // release all filters
    this.dataview.filters.forEach(function (filter) {
      filter.releaseDataFilter();
    });
    // for client side datasets, manually merge the datasets
    toggleDatasetFacets(this, dataset);
    toggleDatasetData(this, dataset);
  }

  dataset.isActive = !dataset.isActive;

  resetDataview(this);
}

module.exports = BaseModel.extend({
  type: 'user',
  props: {
    /**
     * Spot server address
     * @memberof! Me
     * @type {string}
     */
    address: 'string',
    /**
     * Is there a connection with a spot sever?
     * @memberof! Me
     * @type {boolean}
     */
    isConnected: ['boolean', true, false],
    /**
     * When the app in locked down, facets and datasets cannot be edited
     * @memberof! Me
     * @type {boolean}
     */
    isLockedDown: ['boolean', true, false],
    /**
     * Type of spot session. Must be 'client' or 'server'
     * @memberof! Me
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
     * @memberof! Me
     * @type {Dataview}
     */
    dataview: Dataview
  },
  collections: {
    /**
     * Collection of all datasets
     * @memberof! Me
     * @type {Dataset[]}
     */
    datasets: Datasets
  },
  initialize: function () {
    // first do parent class initialization
    BaseModel.prototype.initialize.apply(this, arguments);

    // assign backend driver
    if (arguments.sessionType) {
      if (arguments.sessionType === 'client') {
        this.driver = driverClient;
      } else if (arguments.sessionType === 'server') {
        this.driver = driverServer;
      } else {
        console.error('No driver for type', arguments.sessionType);
      }
    } else {
      // default to client side (crossfilter) sessions
      this.driver = driverClient;
    }
  },
  /**
   * Connect to a spot server
   * @memberof! Me
   * @function
   * @param {string} URL of the spot server
   */
  connectToServer: function (address) {
    this.address = address;
    connectToServer(this, address);
  },
  /**
   * Include or exclude a dataset from the current union
   * @memberof! Me
   * @function
   * @param {Dataset} dataset Dataset to include or exclude
   */
  toggleDataset: toggleDataset
});
