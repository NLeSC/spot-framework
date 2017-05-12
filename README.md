# Spot - framework
[![Build Status](https://travis-ci.org/NLeSC/spot-framework.svg?branch=master)](https://travis-ci.org/NLeSC/spot-framework)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/783828d8433a49a8b33dfa3874e46f76)](https://www.codacy.com/app/NLeSC/spot-framework?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=NLeSC/spot-framework&amp;utm_campaign=Badge_Grade)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/783828d8433a49a8b33dfa3874e46f76)](https://www.codacy.com/app/NLeSC/spot-framework?utm_source=github.com&utm_medium=referral&utm_content=NLeSC/spot-framework&utm_campaign=Badge_Coverage)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/Flet/semistandard)

Group, bin, combine, and aggregate high dimensional datasets for interactive visual analytics.
Define simple (lower dimensional) cross sections of your data, called filters.
Filters partition (bin) the data and can do aggregations (sums, averages, standard deviations, etc).
The result is returned as a simple array which you can plot or analyze (see also the other SPOT projects).
All filters are linked and update automatically.

Using a single API, it can run fully client side, via crossfilter, or it can use a PostgreSQL database using the `spot-server`.

## How to install

1. download and install **node.js**
    - [via package manager](https://nodejs.org/en/download/package-manager) (suggested)
    - [Binaries](https://nodejs.org/en/download)
2. clone this repository:
    ```bash
    git clone https://github.com/NLeSC/spot-framework.git && cd spot
    ```
3. install dependencies:
    ```bash
    npm install
    ```

## Example usage

```javascript

// get a new Spot instance
var Spot = require('./src/me');
var spot = new Spot();

// add a dataset
var dataset = spot.datasets.add({
  name: 'My data'
});

// add some data to the dataset
dataset.crossfilter.add([
  { firstName: 'John', lastName: 'Smith', age: 35 },
  { firstName: 'Mary', lastName: 'Smith', age: 49 },
  { firstName: 'Little', lastName: 'Smith', age: 8 },
  { firstName: 'Dee', lastName: 'Jones', age: 5 },
  { firstName: 'Doo', lastName: 'Jones', age: 9 }
]);

// Have SPOT scan the dataset:
// 1. it auto-detects 'firstName', 'lastName', and 'age' attributes
// 2. it creates the corresponding Facets
dataset.scan();

// make the dataset active
spot.toggleDataset(dataset);

var dataview = spot.dataview;

// add a filter
var filter = dataview.filters.add({
  title: 'filter one'
});

// ... that partitions the data on 'lastName'
filter.partitions.add([
  { facetName: 'lastName', rank: 1 }
]);

filter.partitions.forEach(function (partition) {
  partition.setGroups();
});

// ... and that takes the average over the 'age'
filter.aggregates.add([
  { facetName: 'age', rank: 1, operation: 'avg' }
]);

// initialize the filter
filter.initDataFilter();

// listen to data
filter.on('newData', function () {
  console.log('data: ', filter.data);
});

dataview.getData();
```

## Documentation

The spot documentation can be found [here](http://nlesc.github.io/spot-framework/doc/spot/0.0.6/index.html).

## Credits

Jisk Attema, [the Netherlands eScience Center](http://nlesc.nl)
