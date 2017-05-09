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
 * Data can be requested by sending `getData` with dataset and filter ID, on which the server
 * responds with a `newData` message containing `filterId` and `data`.
 *
 * @module driver/server
 */

/**
 * Autoconfigure a dataset
 */
function scan () {
  console.log('spot-server: scanData');
  this.socket.emit('scanData', {
    dataset: this.toJSON()
  });
}

/**
 * setMinMax sets the range of a continuous or time facet
 * @param {Facet} facet
 */
function setMinMax (facet) {
  console.log('spot-server: setMinMax');
  this.socket.emit('setMinMax', {
    dataset: this.toJSON(),
    facetId: facet.getId()
  });
}

/**
 * setCategories finds finds all values on an ordinal (categorial) axis
 * Updates the categorialTransform of the facet
 *
 * @param {Facet} facet
 */
function setCategories (facet) {
  console.log('spot-server: setCategories');
  facet.categorialTransform.rules.reset();
  this.socket.emit('setCategories', {
    dataset: this.toJSON(),
    facetId: facet.getId()
  });
}

/**
 * Calculate 100 percentiles (ie. 1,2,3,4 etc.), and initialize the `facet.continuousTransform`
 * @param {Facet} facet
 */
function setPercentiles (facet) {
  console.log('spot-server: setPercentiles' + facet.getId());
  this.socket.emit('setPercentiles', {
    dataset: this.toJSON(),
    facetId: facet.getId()
  });
}

/**
 * Initialize the data filter, and construct the getData callback function on the filter.
 * @param {Dataset} dataset
 * @param {Filter} filter
 */
function initDataFilter (dataset, filter) {
  console.log('spot-server: getData for filter ' + filter.getId());
  this.getAllData();
}

/**
 * The opposite or initDataFilter, it should remove the filter and deallocate other configuration
 * related to the filter.
 * @param {Filter} filter
 */
function releaseDataFilter (filter) {
  filter.getData = function () {
    var data = [];
    filter.data = data;
  };
}

/**
 * Change the filter parameters for an initialized filter
 * @param {Filter} filter
 */
function updateDataFilter (filter) {
  // as the SQL server implementation is stateless, nothing to do here
}

module.exports = {
  scan: scan,
  setMinMax: setMinMax,
  setCategories: setCategories,
  setPercentiles: setPercentiles,
  initDataFilter: initDataFilter,
  releaseDataFilter: releaseDataFilter,
  updateDataFilter: updateDataFilter
};
