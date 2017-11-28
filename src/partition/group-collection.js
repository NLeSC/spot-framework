var Collection = require('ampersand-collection');
var Group = require('./group');

function setOrdering (groups, type, ordering) {
  if (ordering === 'count') {
    groups.comparator = function (a, b) {
      if (a.count === b.count) {
        return a.value < b.value ? -1 : 1;
      } else {
        return b.count - a.count;
      }
    };
  } else if (ordering === 'value') {
    if (type === 'categorial') {
      groups.comparator = 'value';
    } else {
      // NOTE: the 'value' field is a string, so sorting 'P10D', 'P7D' results in wrong order
      // the 'min', and 'max' fields correspond to sortable values
      groups.comparator = 'min';
    }
  } else {
    console.error('Ordering not implemented for partition: ', ordering);
  }
  groups.sort();
}

module.exports = Collection.extend({
  indexes: ['value', 'label', 'group', 'groupIndex'],
  model: Group,
  comparator: 'label',
  initialize: function (models, options) {
    var groups = this;
    var partition = options.parent;

    // update group index on resort
    this.on('sort', function () {
      this.forEach(function (group, i) {
        group.groupIndex = i;
      });
    }, this);

    // this.parent := partition
    if (partition) {
      setOrdering(groups, partition.type, partition.ordering);

      partition.on('change ordering', function () {
        setOrdering(groups, partition.type, partition.ordering);
      });
    }
  }
});
