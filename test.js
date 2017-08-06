var YEI3Space = require('./YEI3Space.js');

var sensor = new YEI3Space('/dev/ttyUSB0');

// Turn on packet headers

// Start streaming
sensor.on('data', data => {

});
