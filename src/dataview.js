/**
 * A Dataview is a join of Datasets
 *
 * @class Dataview
 */
var Dataset = require('./dataset');
var Filters = require('./filter/collection');

function getData () {
  if (this.isPaused) {
    return;
  }

  var me = this.parent;

  if (me.sessionType === 'server') {
    console.log('spot-server: getData');

    this.socket.emit('getData', {
      datasets: this.parent.datasets.toJSON(),
      dataview: this.toJSON()
    }, this);
  } else if (me.sessionType === 'client') {
    this.filters.forEach(function (filter) {
      if (filter.isInitialized) {
        filter.getData();
        filter.trigger('newData');
      }
    });
  } else {
    console.error('Dataset type not implemented');
  }
}

module.exports = Dataset.extend({
  props: {
    /**
     * Total number of datapoints in the current dataset
     * @memberof! Dataset
     * @readonly
     * @type {number}
     */
    dataTotal: ['number', true, 0],
    /**
     * Number of datapoints that are currently selected
     * @memberof! Dataset
     * @readonly
     * @type {number}
     */
    dataSelected: ['number', true, 0]
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
     * A Filter collection holding all active filters on the dataview
     * @memberof! Dataview
     * @type {Filter[]}
     */
    filters: Filters
  },
  /**
   * Pause the dataview. This means calls to getData are blocked.
   * Useful when updating a lot of filters and you are not interested in the intermediate state.
   * @memberof Dataview
   */
  pause: function () {
    this.isPaused = true;
  },
  /**
   * Unpause the dataview.
   * @memberof Dataview
   */
  play: function () {
    this.isPaused = false;
  },

  getData: getData
});
