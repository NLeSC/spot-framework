/**
 * @class Dataset
 * @extends Base
 */
var Crossfilter = require('crossfilter2'); // TODO: only for client side datasets
var BaseModel = require('./util/base');
var Facets = require('./facet/collection');

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
     * Name of the dataset
     * @memberof! Dataset
     * @type {string}
     */
    name: {
      type: 'string',
      required: true,
      default: 'Name'
    },
    /**
     * URL, fi. to paper, dataset owner, etc.
     * @memberof! Dataset
     * @type {string}
     */
    URL: {
      type: 'string',
      required: true,
      default: 'URL'
    },
    /**
     * Database table name for server datasets
     * @memberof! Dataset
     * @type {string}
     */
    databaseTable: {
      type: 'string',
      default: ''
    },
    /**
     * Short description of the dataset
     * @memberof! Dataset
     * @type {string}
     */
    description: {
      type: 'string',
      required: true,
      default: 'Description'
    },
    /**
     * If dataset is part of the current session
     * @memberof! Dataset
     * @type {boolean}
     */
    isActive: {
      type: 'boolean',
      required: true,
      default: false
    }
  },
  session: {
    /**
     * For searching through datasets URL and description.
     * True if this dataset matches the search paramters.
     */
    show: {
      type: 'boolean',
      required: true,
      default: true
    },
    data: {
      type: 'array',
      default: function () {
        return [];
      }
    }
  },
  collections: {
    /**
     * A Facet collection holding pre defined facets
     * @memberof! Dataset
     * @type {Facet[]}
     */
    facets: Facets
  },
  scan: function () {
    // Dataset -> Datasets -> spot
    var spot = this.collection.parent;

    spot.driver.scan(this);
  }
});
