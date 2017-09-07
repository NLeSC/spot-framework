/**
 * A Dataview is a join of Datasets
 *
 * @class Dataview
 * @extends Base
 */
var Crossfilter = require('crossfilter2'); // TODO: only for client side datasets
var BaseModel = require('./util/base');
var Filters = require('./filter/collection');
var Facets = require('./facet/collection');

function getData () {
  if (this.isPaused) {
    return;
  }

  var spot = this.parent;

  spot.driver.getData(this);
}

module.exports = BaseModel.extend({
  initialize: function () {
    // first do parent class initialization
    BaseModel.prototype.initialize.apply(this, arguments);

    /**
     * Crossfilter instance, see [here](http://square.github.io/crossfilter/)
     * used for client side data handling.
     *
     * @memberof! Dataset
     */
    this.crossfilter = new Crossfilter([]);
    this.countGroup = this.crossfilter.groupAll().reduceCount();
  },
  props: {
    /**
     * Total number of datapoints in the current dataview
     *
     * @memberof! Dataview
     * @readonly
     * @type {number}
     */
    dataTotal: ['number', true, 0],
    /**
     * Number of datapoints that are currently selected
     *
     * @memberof! Dataview
     * @readonly
     * @type {number}
     */
    dataSelected: ['number', true, 0],
    /**
     * DatasetId's of active datasets
     *
     * @memberof! Dataview
     * @type {String[]}
     */
    datasetIds: {
      type: 'array',
      default: function () {
        return [];
      }
    }
  },
  session: {
    /**
     * isPaused when true, calls to getAllData are ignored.
     * This is useful to suppres calls to getData
     * when adding and removing a number of filters at once.
     * @memberof! Dataview
     * @type {boolean}
     */
    isPaused: ['boolean', true, false]
  },
  collections: {
    /**
     * A Facet collection holding pre defined facets
     *
     * @memberof! Dataview
     * @type {Facet[]}
     */
    facets: Facets,
    /**
     * A Filter collection holding all active filters on the dataview
     *
     * @memberof! Dataview
     * @type {Filter[]}
     */
    filters: Filters
  },
  /**
   * Pause the dataview. This means calls to getData are blocked.
   * Useful when updating a lot of filters and you are not interested in the intermediate state.
   *
   * @memberof! Dataview
   */
  pause: function () {
    this.isPaused = true;
  },
  /**
   * Unpause the dataview.
   *
   * @memberof! Dataview
   */
  play: function () {
    this.isPaused = false;
  },

  /**
   * Get data for all filters linked to this dataview.
   * When data has become available for a filter, a `newData` event is triggered on that filter.
   *
   * @memberof! Dataview
   * @function
   */
  getData: getData
});
