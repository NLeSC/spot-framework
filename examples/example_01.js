var Spot = require('..');

// get a new Spot instance
var spot = new Spot();

// add a dataset
var dataset = spot.datasets.add({
  name: 'My data'
});

// add some data to the dataset
var mydata = [
  { firstName: 'John', lastName: 'Smith', age: 35 },
  { firstName: 'Mary', lastName: 'Smith', age: 49 },
  { firstName: 'Little', lastName: 'Smith', age: 8 },
  { firstName: 'Dee', lastName: 'Jones', age: 5 },
  { firstName: 'Doo', lastName: 'Jones', age: 9 }
];
dataset.data = mydata;
console.log('Starting with:');
console.log(mydata);

// scan the dataset:
// 1. auto-detects 'firstName', 'lastName', and 'age' attributes
// 2. creates the corresponding Facets
dataset.scan();

// make the dataset active
spot.toggleDataset(dataset);

var dataview = spot.dataview;

// add some filters
var filterA = dataview.filters.add({ title: 'filter A' });
var filterB = dataview.filters.add({ title: 'filter B' });

// ... that partitions the data on 'lastName'
filterA.partitions.add([ { facetName: 'lastName', rank: 1 } ]);

// , and on 'age' using two bins; as minimum was 5 and maximum was 49 these will be
// [5, 27) labelled as '16' and [27, 49] labelled as '38'
filterB.partitions.add([ { facetName: 'age', rank: 1, groupingParam: 2 } ]);

filterA.partitions.forEach(function (partition) { partition.setGroups(); });
filterB.partitions.forEach(function (partition) { partition.setGroups(); });

// ... and that takes the average over the 'age'
filterA.aggregates.add([ { facetName: 'age', rank: 1, operation: 'avg' } ]);

// initialize the filters
filterA.initDataFilter();
filterB.initDataFilter();

// listen to data
filterA.on('newData', function () {
  console.log();
  console.log('data filterA: group by last name, average of age');
  console.log(this.data);
}, filterA);

filterB.on('newData', function () {
  console.log();
  console.log('data filterB: binned by age in [5, 27) labelled "16", and (27, 49] labelled "38":');
  console.log(this.data);
}, filterB);

dataview.getData();

console.log('---------------------------');
console.log('Selecting \'Jones\'');
console.log('---------------------------');

// select 'Jones' on filterA
var partition = filterA.partitions.get(1, 'rank');

partition.updateSelection({
  value: 'Jones'
});
filterA.updateDataFilter();

dataview.getData();
