var Collection = require('ampersand-collection');
var ClientDataset = require('./client');
var ServerDataset = require('./server');
var GenericDataset = require('../dataset');

module.exports = Collection.extend({
  mainIndex: 'id',
  model: function (attrs, options) {
    if (attrs.datasetType === 'client') {
      console.log('Adding client dataset');
      return new ClientDataset(attrs, options);
    } else if (attrs.datasetType === 'server') {
      console.log('Adding server dataset');
      return new ServerDataset(attrs, options);
    }

    return new GenericDataset(attrs, options);
  },

  isModel: function (model) {
    return model instanceof ClientDataset || model instanceof ServerDataset || model instanceof GenericDataset;
  }
});
