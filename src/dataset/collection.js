var Collection = require('ampersand-collection');
var Dataset = require('../dataset');

module.exports = Collection.extend({
  mainIndex: 'id',
  indexes: ['name'],
  model: Dataset
});
