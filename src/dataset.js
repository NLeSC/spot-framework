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
    // TODO: only for server side datasets
    /**
     * Database table name for server datasets, indicate table joins with a pipe: '|'
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
    isActive: ['boolean', true, false]
  },
  session: {
    /**
     * For searching through datasets URL and description.
     * True if this dataset matches the search paramters.
     */
    show: ['boolean', true, true]
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
    var dataset = this;
    var datasets = dataset.collection;
    var me = datasets.parent;
    me.driver.scan(dataset);
  }
});
