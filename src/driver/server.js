/**
 * Server side filtering
 *
 * Implementation of a dataset backed by a server, which in turn uses fi. postgreSQL
 * Fully asynchronous, based on socketIO.
 *
 * Most methods below result in a message with the methodName and a data object, containing:
 *  * `datasets` and `dataview`, or `dataset`
 *  * `filterId` or `facetId`
 *
 * Data can be requested using the dataview.getData() method
 * responds with a `newData` message containing `filterId` and `data`.
 *
 * @module driver/server
 */

/**
 * Autoconfigure a dataset
 *
 * @param {Dataset} dataset
 */
function scan (dataset) {
  // Dataset -> Datasets -> Spot
  var spot = dataset.collection.parent;

  console.log('emit: scanData');
  spot.socket.emit('scanData', {
    datasetID: dataset.toJSON()
  });
}

/**
 * setMinMax sets the range of a continuous or time facet
 *
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setMinMax (dataset, facet) {
  // Dataset -> Datasets -> Spot
  var spot = dataset.collection.parent;

  console.log('emit: setMinMax');
  spot.socket.emit('setMinMax', {
    dataset: this.toJSON(),
    facetId: facet.getId()
  });
}

/**
 * setCategories finds finds all values on an ordinal (categorial) axis
 * Updates the categorialTransform of the facet
 *
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setCategories (dataset, facet) {
  // Dataset -> Datasets -> Spot
  var spot = dataset.collection.parent;

  facet.categorialTransform.rules.reset();
  console.log('emit: setCategories');
  spot.socket.emit('setCategories', {
    dataset: this.toJSON(),
    facetId: facet.getId()
  });
}

/**
 * Calculate 100 percentiles (ie. 1,2,3,4 etc.), and initialize the `facet.continuousTransform`
 *
 * @param {Dataset} dataset
 * @param {Facet} facet
 */
function setPercentiles (dataset, facet) {
  // Dataset -> Datasets -> Spot
  var spot = dataset.collection.parent;

  console.log('emit: setPercentiles');
  spot.socket.emit('setPercentiles', {
    dataset: this.toJSON(),
    facetId: facet.getId()
  });
}

/**
 * Initialize the data filter, and construct the getData callback function on the filter.
 * @param {Dataview} dataview
 * @param {Filter} filter
 */
function initDataFilter (dataview, filter) {
  // as the SQL server implementation is stateless, nothing to do here
}

/**
 * The opposite or initDataFilter, it should remove the filter and deallocate other configuration
 * related to the filter.
 * @param {Filter} filter
 */
function releaseDataFilter (filter) {
  // as the SQL server implementation is stateless, nothing to do here
}

/**
 * Change the filter parameters for an initialized filter
 * @param {Filter} filter
 */
function updateDataFilter (filter) {
  // as the SQL server implementation is stateless, nothing to do here
}

/**
 * Get data for every filter, and trigger a 'newData' event
 *
 * Returns a Promise that resolves to the dataview when all data and metadata has been updated
 *
 * @param {Dataview} dataview
 * @returns {Promise}
 */
function getData (dataview) {
  var spot = dataview.parent;

  return new Promise(function (resolve, reject) {
    spot.socket.emit('getData', {
      datasets: spot.datasets.toJSON(),
      dataview: dataview.toJSON()
    });

    dataview.once('newMetaData', function () {
      resolve(dataview);
    });
  });
}

module.exports = {
  driverType: 'server',
  scan: scan,
  setMinMax: setMinMax,
  setCategories: setCategories,
  setPercentiles: setPercentiles,
  initDataFilter: initDataFilter,
  releaseDataFilter: releaseDataFilter,
  updateDataFilter: updateDataFilter,
  getData: getData
};
