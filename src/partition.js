/**
 * Partition
 *
 * Describes a partitioning of the data, based on the values a Facet can take.
 *
 * @class Partition
 * @extends Base
 */
var BaseModel = require('./util/base');
var Groups = require('./partition/group-collection');
var moment = require('moment-timezone');
var selection = require('./util/selection');
var util = require('./util/time');

/*
 * @param {Partition} partition
 * @param {Group[]} groups
 * @memberof! Partition
 */
function setDatetimeGroups (partition, groups) {
  var timeStart = partition.minval;
  var timeEnd = partition.maxval;
  var timeRes = partition.groupingDatetime;
  var timeZone = partition.zone;

  if (timeRes === 'auto') {
    timeRes = util.getDatetimeResolution(timeStart, timeEnd);
  }

  var current = moment(timeStart);
  while ((!current.isAfter(timeEnd)) && groups.length < 500) {
    // make sure the value for this bin is inside the valid range
    var value = moment(current).tz(timeZone).startOf(timeRes);
    if (value.isBefore(timeStart)) {
      value = moment(timeStart);
    }

    groups.add({
      min: moment(current).tz(timeZone).startOf(timeRes),
      max: moment(current).tz(timeZone).endOf(timeRes),
      value: value.format(),
      label: moment(current).tz(timeZone).startOf(timeRes).format()
    });
    current.add(1, timeRes);
  }
}

/*
 * @param {Partition} partition
 * @param {Group[]} groups
 * @memberof! Partition
 */
function setDurationGroups (partition, groups) {
  var dStart = partition.minval;
  var dEnd = partition.maxval;
  var dRes = util.getDurationResolution(dStart, dEnd);

  var current = Math.floor(parseFloat(dStart.as(dRes)));
  var last = Math.floor(parseFloat(dEnd.as(dRes)));

  while (current <= last) {
    // make sure the value for this bin is inside the valid range
    var value = moment.duration(current, dRes);
    if (value < dStart) {
      value = dStart;
    }
    groups.add({
      min: moment.duration(current, dRes),
      max: moment.duration(current + 1, dRes),
      value: value.toISOString(),
      label: moment.duration(current, dRes).toISOString()
    });

    current = current + 1;
  }
}

/*
 * Setup a grouping based on the `partition.groupingContinuous`, `partition.minval`,
 * `partition.maxval`, and the `partition.groupingParam`.
 * @memberof! Partition
 * @param {Partition} partition
 * @param {Group[]} groups
 */
function setContinuousGroups (partition, groups) {
  var param = partition.groupingParam;
  var x0, x1, size, nbins;

  if (partition.groupFixedN) {
    // A fixed number of equally sized bins
    nbins = param;
    x0 = partition.minval;
    x1 = partition.maxval;
    size = (x1 - x0) / nbins;
  } else if (partition.groupFixedS) {
    // A fixed bin size
    size = param;
    x0 = Math.floor(partition.minval / size) * size;
    x1 = Math.ceil(partition.maxval / size) * size;
    nbins = (x1 - x0) / size;
  } else if (partition.groupFixedSC) {
    // A fixed bin size, centered on 0
    size = param;
    x0 = (Math.floor(partition.minval / size) - 0.5) * size;
    x1 = (Math.ceil(partition.maxval / size) + 0.5) * size;
    nbins = (x1 - x0) / size;
  } else if (partition.groupLog) {
    // Fixed number of logarithmically (base 10) sized bins
    nbins = param;
    x0 = Math.log(partition.minval) / Math.log(10.0);
    x1 = Math.log(partition.maxval) / Math.log(10.0);
    size = (x1 - x0) / nbins;
  }

  function unlog (x) {
    return Math.exp(x * Math.log(10));
  }

  var i;
  for (i = 0; i < nbins; i++) {
    var start = x0 + i * size;
    var end = x0 + (i + 1) * size;
    var mid = 0.5 * (start + end);

    if (partition.groupLog) {
      groups.add({
        min: unlog(start),
        max: unlog(end),
        value: unlog(start),
        label: unlog(end).toPrecision(5)
      });
    } else {
      groups.add({
        min: start,
        max: end,
        value: mid,
        label: mid.toPrecision(5)
      });
    }
  }
}

/*
 * Setup a grouping based on the `partition.categorialTransform`
 * @memberof! Partition
 * @param {Partition} partition
 * @param {Group[]} groups
 */
function setCategorialGroups (partition, groups) {
  // dataview -> filters -> filter -> partitions -> partition
  //          -> facets

  var dataview;
  var facet;
  try {
    dataview = partition.collection.parent.collection.parent;
    facet = dataview.facets.get(partition.facetName, 'name');
  } catch (e) {
    console.error('setCategorialGroups: cannot locate facet for this partition');
    return;
  }

  if (facet.isCategorial) {
    // default: a categorial facet, with a categorial parittion
    facet.categorialTransform.rules.forEach(function (rule, i) {
      groups.add({
        value: rule.group,
        label: rule.group,
        count: rule.count
      });
    });
  } else if (facet.isDatetime) {
    var format = facet.datetimeTransform.transformedFormat;
    var timePart = util.timeParts.get(format, 'description');

    timePart.groups.forEach(function (g, i) {
      groups.add({
        value: g,
        label: g,
        count: 0
      });
    });
  } else {
    console.warn('Not implemented');
  }
}

/**
 * Reset type, minimum and maximum values
 * @params {Partition} partition
 * @params {Object} Options - silent do not trigger change events
 * @memberof! Partition
 */
function reset (options) {
  var partition = this;
  // partition -> partitions -> filter -> filters -> dataview
  var filter = partition.collection.parent;
  var dataview = filter.collection.parent;
  var facet = dataview.facets.get(partition.facetName, 'name');
  options = options || {};

  partition.set({
    type: facet.transform.transformedType,
    minval: facet.transform.transformedMin,
    maxval: facet.transform.transformedMax
  }, options);
}

module.exports = BaseModel.extend({
  dataTypes: {
    'numberDatetimeOrDuration': {
      set: function (value) {
        var newValue;

        // check for momentjs objects
        if (value.constructor.name === 'Duration') {
          return {
            val: moment.duration(value),
            type: 'numberDatetimeOrDuration'
          };
        }
        if (moment.isMoment(value)) {
          return {
            val: value.clone(),
            type: 'numberDatetimeOrDuration'
          };
        }

        // try to create momentjs objects
        newValue = moment(value, moment.ISO_8601);
        if (newValue.isValid()) {
          return {
            val: newValue,
            type: 'numberDatetimeOrDuration'
          };
        }
        if (typeof value === 'string' && value[0].toLowerCase() === 'p') {
          newValue = moment.duration(value);
          return {
            val: newValue,
            type: 'numberDatetimeOrDuration'
          };
        }

        // try to set a number
        if (value === +value) {
          return {
            val: +value,
            type: 'numberDatetimeOrDuration'
          };
        }

        // failed..
        return {
          val: value,
          type: typeof value
        };
      },
      compare: function (currentVal, newVal) {
        if (currentVal instanceof moment) {
          return currentVal.isSame(newVal);
        } else {
          return +currentVal === +newVal;
        }
      }
    }
  },
  props: {
    /**
     * Label for displaying on plots
     * @memberof! Partition
     * @type {string}
     */
    label: {
      type: 'string',
      required: true,
      default: ''
    },
    /**
     * Show a legend for this partition
     * @memberof! Partition
     * @type {string}
     */
    showLegend: {
      type: 'boolean',
      required: false,
      default: true
    },
    /**
     * Show an axis label for this partition
     * @memberof! Partition
     * @type {string}
     */
    showLabel: {
      type: 'boolean',
      required: false,
      default: true
    },

    /**
     * Timezone for partitioning
     * @memberof! DatetimeTransform
     * @type {string}
     */
    zone: {
      type: 'string',
      required: 'true',
      default: function () {
        return moment.tz.guess();
      }
    },

    /**
     * Type of this partition
     * @memberof! Partition
     * @type {string}
     */
    type: {
      type: 'string',
      required: true,
      default: 'categorial',
      values: ['constant', 'continuous', 'categorial', 'datetime', 'duration', 'text']
    },

    /**
     * The name of the facet to partition over
     * @memberof! Partition
     * @type {string}
     */
    facetName: 'string',

    /**
     * When part of a partitioning, this deterimines the ordering
     * @memberof! Partition
     * @type {number}
     */
    rank: {
      type: 'number',
      required: true
    },

    /**
     * For categorial and text Facets, the ordering can be alfabetical or by count
     * @memberof! Partition
     */
    ordering: {
      type: 'string',
      values: ['count', 'value'],
      required: true,
      default: 'value'
    },

    /**
     * For continuous or datetime Facets, the minimum value. Values lower than this are grouped to 'missing'
     * @memberof! Partition
     * @type {number|moment}
     */
    minval: 'numberDatetimeOrDuration',

    /**
     * For continuous or datetime Facets, the maximum value. Values higher than this are grouped to 'missing'
     * @memberof! Partition
     * @type {number|moment}
     */
    maxval: 'numberDatetimeOrDuration',

    /**
     * Extra parameter used in the grouping strategy: either the number of bins, or the bin size.
     * @memberof! Partition
     * @type {number}
     */
    groupingParam: ['number', true, 20],

    /**
     * Grouping continuous strategy:
     *  * `fixedn`  fixed number of bins in the interval [minval, maxval]
     *  * `fixedsc` a fixed binsize, centered on zero
     *  * `fixeds`  a fixed binsize, starting at zero
     *  * `log`     fixed number of bins but on a logarithmic scale
     * Don't use directly but check grouping via the groupFixedN, groupFixedSC,
     * groupFixedS, and groupLog properties
     * @memberof! Partition
     * @type {number}
     */
    groupingContinuous: {
      type: 'string',
      required: true,
      default: 'fixedn',
      values: ['fixedn', 'fixedsc', 'fixeds', 'log']
    },

    /**
     * Grouping datetime strategy:
     * round datetimes down to one of these units:
     * auto, milliseconds, seconds, minutes, hours, days, weeks, months, years
     *
     * @memberof! Partition
     * @type {string}
     */
    groupingDatetime: {
      type: 'string',
      required: true,
      default: 'auto',
      values: ['auto', 'milliseconds', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years']
    },

    /**
     * Depending on the type of partition, this can be an array of the selected groups,
     * or a numberic interval [start, end]
     * @memberof! Partition
     * @type {array}
     */
    // NOTE: for categorial facets, contains rule.group
    selected: {
      type: 'array',
      required: true,
      default: function () {
        return [];
      }
    }
  },
  derived: {
    // properties for: type
    isConstant: {
      deps: ['type'],
      fn: function () {
        return this.type === 'constant';
      }
    },
    isContinuous: {
      deps: ['type'],
      fn: function () {
        return this.type === 'continuous';
      }
    },
    isCategorial: {
      deps: ['type'],
      fn: function () {
        return this.type === 'categorial';
      }
    },
    isDatetime: {
      deps: ['type'],
      fn: function () {
        return this.type === 'datetime';
      }
    },
    isDuration: {
      deps: ['type'],
      fn: function () {
        return this.type === 'duration';
      }
    },
    isText: {
      deps: ['type'],
      fn: function () {
        return this.type === 'text';
      }
    },
    // properties for grouping-continuous
    groupFixedN: {
      deps: ['groupingContinuous'],
      fn: function () {
        return this.groupingContinuous === 'fixedn';
      }
    },
    groupFixedSC: {
      deps: ['groupingContinuous'],
      fn: function () {
        return this.groupingContinuous === 'fixedsc';
      }
    },
    groupFixedS: {
      deps: ['groupingContinuous'],
      fn: function () {
        return this.groupingContinuous === 'fixeds';
      }
    },
    groupLog: {
      deps: ['groupingContinuous'],
      fn: function () {
        return this.groupingContinuous === 'log';
      }
    },
    /**
     * The (ordered) set of groups this Partition can take, making up this partition.
     * The list is recalculated when any of the partition's properties change:
     * 'groupingContinuous', 'groupingParam', 'minval', 'maxval', 'type', 'zone' change
     * The list keeps itself sorted according to the partition.ordering
     *
     * Can be used for plotting etc.
     * @memberof! Partition
     * @type {Group[]}
     */
    groups: {
      deps: ['groupingContinuous', 'groupingParam', 'groupingDatetime', 'minval', 'maxval', 'type', 'zone'],
      fn: function () {
        var partition = this;
        var groups = new Groups([], {
          parent: partition
        });

        if (partition.isCategorial) {
          setCategorialGroups(partition, groups);
        } else if (partition.isContinuous) {
          setContinuousGroups(partition, groups);
        } else if (partition.isDatetime) {
          setDatetimeGroups(partition, groups);
        } else if (partition.isDuration) {
          setDurationGroups(partition, groups);
        } else if (partition.isText) {
          // no-op
        } else {
          console.error('Cannot set groups for partition', partition.getId());
        }

        return groups;
      }
    }
  },
  updateSelection: function (group) {
    selection.updateSelection(this, group);
  },
  filterFunction: function () {
    return selection.filterFunction(this);
  },
  reset: reset
});
