/**
 * Selections
 *
 * @class Selection
 */
var BaseModel = require('./base');
var misval = require('../misval');
var Groups = require('./group-collection');
var moment = require('moment-timezone');

module.exports = BaseModel.extend({
  props: {
    /**
     * Depending on the type of selection, this can be an array of the selected groups,
     * or a numberic interval [start, end]
     * @memberof! Selection
     * @type {array}
     */
    selected: {
      type: 'any',
      required: true,
      default: function () {
        return [];
      }
    },
    /**
     * Type of selection, must be either categorial, constant, continuous, or time
     * @memberof! Selection
     */
    type: {
      type: 'string',
      required: true,
      default: 'categorial',
      values: ['categorial', 'constant', 'continuous', 'datetime']
    },
    /**
     * Indicates if distances are treated logarithmically
     * @memberof! Selection
     */
    isLogScale: {
      type: 'boolean',
      required: true,
      default: false
    }
  },
  derived: {
    /**
     * A filter function based on the current widget and selection
     * @memberof! Selection
     */
    filterFunction: {
      deps: ['selected'],
      cache: false,
      fn: function () {
        if (this.type === 'categorial' || this.type === 'constant') {
          return filterFunctionCategorial1D.call(this);
        } else if (this.type === 'continuous') {
          return filterFunctionContinuous1D.call(this);
        } else if (this.type === 'datetime') {
          return filterFunctionTime1D.call(this);
        } else {
          console.error('Cannot make filterfunction for selection', this);
        }
      }
    }
  },
  collections: {
    /**
     * @memberof! Selection
     * @type {Group[]}
     */
    groups: Groups
  },
  /**
   * Update a selection with a given group or interval
   *
   * For categorial selections the following rules are used:
   * 1. none selected:
   *    add the group to the selection
   * 2. one selected and the group is the same:
   *    invert the selection
   * 3. one selected and the group is different:
   *    add the group to the selection
   * 4. more than one selected and the group is in the selection:
   *    remove the group from the selection
   * 5. more than one selected and the group is not in the selection:
   *    add the group to the selection
   *
   * For continuous selections the following rules are used:
   * 1. no range selected
   *    set the range equal to that of the group
   * 2. a range selected and the group is outside the selection:
   *    extend the selection to include the group
   * 3. a range selected and the group is inside the selection:
   *    set the endpoint closest to the group to that of the group
   *
   * @memberof! Selection
   * @function
   * @param {(string|number[])} Group or interval
   */
  update: function (group) {
    if (this.type === 'categorial' || this.type === 'constant') {
      updateCategorial1D(this, group);
    } else if (this.type === 'continuous') {
      updateContinuous1D(this, group);
    } else if (this.type === 'datetime') {
      updateTime1D(this, group);
    } else {
      console.error('Cannot update selection', this);
    }
  },
  /**
   * Clear the selection (ie. all points are selected),
   * @memberof! Selection
   * @function
   */
  reset: function () {
    this.selected.splice(0, this.selected.length);
  }
});

/*
 * @param {Group} group - The group to add or remove from the filter
 */
function updateCategorial1D (selection, group) {
  var selected = selection.selected;

  if (selected.length === 0) {
    // 1. none selected:
    selected.push(group.value);
  } else if (selected.length === 1) {
    if (selected[0] === group.value) {
      // 2. one selected and the group is the same:
      selection.reset();
      selection.groups.forEach(function (g) {
        if (g.value !== group.value) {
          selected.push(g.value);
        }
      });
    } else {
      // 3. one selected and the group is different:
      selected.push(group.value);
    }
  } else {
    var i;
    i = selected.indexOf(group.value);
    if (i > -1) {
      // 4. more than one selected and the group is in the selection:
      selected.splice(i, 1);
    } else {
      // 5. more than one selected and the group is not in the selection:
      selected.push(group.value);
    }
  }

  // after add: if filters == groups, reset and dont filter
  if (selected.length === selection.groups.length) {
    selected.splice(0, selected.length);
  }
  return;
}

/*
 * @param {Group} group - The group to add or remove from the filter
 */
function updateContinuous1D (selection, group) {
  var selected = selection.selected;

  if (selected.length === 0) {
    // nothing selected, start a range
    selected[0] = group.min;
    selected[1] = group.max;
  } else if (group.min >= selected[1]) {
    // clicked outside to the rigth of selection
    selected[1] = group.max;
  } else if (group.max <= selected[0]) {
    // clicked outside to the left of selection
    selected[0] = group.min;
  } else {
    // clicked inside selection
    var d1, d2;
    if (selection.isLogScale) {
      d1 = Math.abs(Math.log(selected[0]) - Math.log(group.min));
      d2 = Math.abs(Math.log(selected[1]) - Math.log(group.max));
    } else {
      d1 = Math.abs(selected[0] - group.min);
      d2 = Math.abs(selected[1] - group.max);
    }
    if (d1 < d2) {
      selected[0] = group.min;
    } else {
      selected[1] = group.max;
    }
  }
}

function updateTime1D (selection, group) {
  var selected = selection.selected;

  if (selected.length === 0) {
    // nothing selected, start a range
    selected[0] = group.min;
    selected[1] = group.max;
    return;
  }

  var selectionStart = moment(selected[0]);
  var selectionEnd = moment(selected[1]);

  var groupStart = moment(group.min);
  var groupEnd = moment(group.max);

  if (groupStart.isAfter(selectionEnd)) {
    // clicked outside to the rigth of selection
    selected[1] = group.max;
  } else if (groupEnd.isBefore(selectionStart)) {
    // clicked outside to the left of selection
    selected[0] = group.min;
  } else {
    // clicked inside selection
    var d1, d2;
    d1 = Math.abs(selectionStart.diff(groupStart));
    d2 = Math.abs(selectionEnd.diff(groupEnd));

    if (d1 < d2) {
      selected[0] = group.min;
    } else {
      selected[1] = group.max;
    }
  }
}

/*
 * Set a categorial 1D filter function
 */
function filterFunctionCategorial1D () {
  if (this.selected.length === 0) {
    return function (d) {
      return true;
    };
  } else {
    var haystack = {};
    this.selected.forEach(function (h) {
      haystack[h] = true;
    });

    return function (d) {
      var needle = d;
      if (!(needle instanceof Array)) {
        needle = [d];
      }

      var selected = false;
      needle.forEach(function (s) {
        selected = selected | haystack[s];
      });
      return selected;
    };
  }
}

/*
 * Set a continuous 1D filter function
 */
function filterFunctionContinuous1D () {
  if (!this.selected || !this.selected.length) {
    return function (d) {
      return true;
    };
  }

  var min = this.selected[0];
  var max = this.selected[1];
  var edge = this.groups.models[this.groups.length - 1].max;

  // return true if min <= d < max
  return function (d) {
    return ((d >= min && d < max) || ((d === edge) && (max === edge))) && (d !== misval);
  };
}

/*
 * Set a continuous 1D filter function on a time dimension
 */
function filterFunctionTime1D () {
  if (!this.selected || !this.selected.length) {
    return function (d) {
      return true;
    };
  }

  var min = moment(this.selected[0]);
  var max = moment(this.selected[1]);
  var edge = moment(this.groups.models[this.groups.length - 1].max);

  // return true if min <= d < max
  return function (d) {
    return (d !== misval) && (d.isAfter(min) || d.isSame(min)) && (d.isBefore(max) || (max.isSame(edge) && max.isSame(d)));
  };
}
