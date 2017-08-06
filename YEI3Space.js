var serialport = require('serialport');
var SerialPort = serialport.SerialPort;

var Parser = require('binary-parser').Parser;

var serialPort;

var timeouts = 0;

function getFormatFullLength(format) {
	var sum = 0;
	for (var i in format) {
		sum += getFormatTypeLength(format[i]) * (format[i].arrayLength || 1);
	}
	return sum;
}

function getFormatTypeLength(format) {
	if (format.type == 'floatLE') {
		return 4;
	}
	if (format.type == 'floatBE') {
		return 4;
	}
	if (format.type == 'doubleLE') {
		return 8;
	}
	if (format.type == 'doubleBE') {
		return 8;
	}
	if (format.type == 'intLE') {
		return format.length;
	}
	if (format.type == 'intBE') {
		return format.length;
	}
	if (format.type == 'uintLE') {
		return format.length;
	}
	if (format.type == 'uintBE') {
		return format.length;
	}
	if (format.type == 'string') {
		return format.length;
	}
	if (format.type == 'byte') {
		return 1;
	}
	if (format.type == 'bool') {
		return 1;
	}
}

function readNextData(data, format, offset) {
	if (format.type == 'floatLE') {
		return data.readFloatLE(offset);
	}
	if (format.type == 'floatBE') {
		return data.readFloatBE(offset);
	}
	if (format.type == 'doubleLE') {
		return data.readDoubleLE(offset);
	}
	if (format.type == 'doubleBE') {
		return data.readDoubleBE(offset);
	}
	if (format.type == 'intLE') {
		return data.readIntLE(offset, format.length);
	}
	if (format.type == 'intBE') {
		return data.readIntBE(offset, format.length);
	}
	if (format.type == 'uintLE') {
		return data.readUIntLE(offset, format.length);
	}
	if (format.type == 'uintBE') {
		return data.readUIntBE(offset, format.length);
	}
	if (format.type == 'string') {
		return data.toString(format.encoding, offset, offset + format.length);
	}
	if (format.type == 'byte') {
		return data.readUInt8(offset);
	}
	if (format.type == 'bool') {
		return data.readUInt8(offset) !== 0;
	}
}

function ParseBlock(data, format, offset) {
	// Make sure offset starts as a number
	offset = offset || 0;

	if (offset) data = data.slice(offset);

	return format.parse(data);
}

var headerFormat = {parser: new Parser(), length: 0};
var responseFormat = false;
var streamingFormat = false;

// Incoming bytes buffer
var buff = new Buffer(5000);
buff.fill(0);
// How much of the buffer has real data in it
var buffLen = 0;

function getByteSum(buff, offset, end) {
	var ret = 0;
	for (var i = (offset || 0); i < (end || buff.length); i++) {
		ret += buff[i];
	}
	return ret & 0xff;
}

function yeiParserDebug() {
	return;
	console.log('yei parser', ...arguments);
}

function YEIParser(emitter, data) {
	var cpLen = data.copy(buff, buffLen);

	if (cpLen < data.length) {
		emitter.emit('error', 'Buffer overrun');
	}

	yeiParserDebug('New data');
	yeiParserDebug(data);

	if (!responseFormat && !streamingFormat) {
		return;
	}

	buffLen += cpLen;

	var headerLength;

	while (buffLen >= (headerLength = headerFormat.length)) {
		yeiParserDebug(' loop');

		yeiParserDebug(responseFormat);
		yeiParserDebug(streamingFormat);

		var message = {};
		message.header = ParseBlock(buff, headerFormat.parser);

		var format, event, messageLength;

		if (message.header.commandEcho !== undefined) {
			yeiParserDebug('	commandEcho :' + message.header.commandEcho);
			// If commandEcho is turned on, we know which format to use
			event = message.header.commandEcho == 0xff ? 'stream' : 'response';
			format = event == 'response' ? responseFormat : streamingFormat;
			
			//IF ERRORED HERE: check to see if command exists in getCommandResponseFormat function
			if(format)
				messageLength = format.length;
			else
				messageLength = 0;
		}

		yeiParserDebug(messageLength);

		if (message.header.dataLength !== undefined) {
			yeiParserDebug('	dataLength');
			if (buffLen < headerLength + message.header.dataLength) {
				// Not enough data in the buffer yet. Wait for more
				break;
			}
			// If streaming data and we have no idea waht to do with it, discard it
			if (event == 'stream' && !format) {
				buff.copy(buff, 0, headerLength + message.header.dataLength);
				buffLen -= headerLength + message.header.dataLength;
				continue;
			}
			if ((messageLength !== undefined) && (messageLength != message.header.dataLength)) {
				emitter.emit('warning', 'Incoming message length does not match expected format.');
				yeiParserDebug('	Incoming message length does not match expected format.');
			}
			messageLength = message.header.dataLength;
		} else if (event == 'stream' && !format) {
			// Discard streaming data. Since we don't know how long it is, drop all the data.
			buffLen = 0;
			break;
		}

		if (!format) {
			yeiParserDebug('	no Format yet');
			// Since commandEcho was not turned on, we'll need to guess now
			if (messageLength !== undefined) {
				// If messageLength is known, try to match it to one of our expected formats
				if (responseFormat && (messageLength == responseFormat.length)) {
					event = 'response';
				} else if (streamingFormat && (messageLength == streamingFormat.length)) {
					event = 'stream';
				} else {
					emitter.emit('warning', 'Incoming message length does not match either expected format.');
					event = responseFormat ? 'response' : 'stream';
				}
			} else {
				// Neither dataLength nor commandEcho are set. We gotta guess
				event = responseFormat ? 'response' : 'stream';
			}

			format = event == 'response' ? responseFormat : streamingFormat;
		}

		if (messageLength === undefined) {
			yeiParserDebug('	guess length');
			messageLength = format.length;
		}

		if (message.header.checksum !== undefined) {
			yeiParserDebug('	checksum', message.header.checksum, getByteSum(buff, headerLength, headerLength + messageLength));
			message.valid = message.header.checksum === getByteSum(buff, headerLength, headerLength + messageLength);
		}

		yeiParserDebug(' body start');

		message.body = ParseBlock(buff, format.parser, headerLength);

		yeiParserDebug(' body stop');

		emitter.emit(event, message);

		yeiParserDebug(' data emitted');

		buff.copy(buff, 0, headerLength + messageLength);
		buffLen -= headerLength + messageLength;
	}

	yeiParserDebug('done');
}

//TODO: If you ever make more than one of these, life will be bad.
function YEI(portName) {

	serialPort = new SerialPort(portName, {baudRate:115200, parser: YEIParser, bufferSize: 500}, false);

	serialPort.on('error', function (err) {
		console.log('Serial Port Error: ');
		console.log(err);
	});
}

/*
 * Returns the parser given the command and format
 */
function getCommandResponseFormat(command, format) {
	var p, length;

	if (format) {
		p = format.parser;
		length = format.length;
	} else {
		p = (new Parser()).endianess('big');
		length = 0;
	}

	if (command == 0x01) {
		p = p.array('eulerOrientation', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	if (command == 0x21) {
		p = p.array('gyro', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	if (command == 0x40) {
		p = p
			.array('gyro', {type: 'floatbe', length: 3})
			.array('accelerometer', {type: 'floatbe', length: 3})
			.array('compass', {type: 'floatbe', length: 3});
		length += 4 * 3 * 3;
	}
	//corrected data
	if (command == 0x25) {
		p = p
			.array('correctgyro', {type: 'floatbe', length: 3})
			.array('correctaccelerometer', {type: 'floatbe', length: 3})
			.array('correctcompass', {type: 'floatbe', length: 3});
		length += 4 * 3 * 3;
	}
	if (command == 0x26){
		p = p.array('correctgyro', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	if (command == 0x27){
		p = p.array('correctaccel', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	if (command == 0x28){
		p = p.array('correctcomp', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	//raw data
	if (command == 0x40) {
		p = p
			.array('rawgyro', {type: 'floatbe', length: 3})
			.array('rawaccelerometer', {type: 'floatbe', length: 3})
			.array('rawcompass', {type: 'floatbe', length: 3});
		length += 4 * 3 * 3;
	}
	if (command == 0x41){
		p = p.array('rawgyro', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	if (command == 0x42){
		p = p.array('rawaccel', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}
	if (command == 0x43){
		p = p.array('rawcomp', {type: 'floatbe', length: 3});
		length += 4 * 3;
	}

	return {parser: p, length: length};
}

/**
 * sendCommand(command, [sendBuffer,] [doneSendingCallback, [responseRecievedCallback]])
 */
function sendCommand(command, data, doneSending, responseRecieved) {
	if (typeof data === 'undefined' || typeof data === 'function') {
		responseRecieved = doneSending;
		doneSending = data;
		data = new Buffer(0);
	}

	var sendBuff = new Buffer(data.length + 3);

	// Wired binary command with header in response
	sendBuff[0] = 0xF9;
	sendBuff[1] = command;

	data.copy(sendBuff, 2);

	sendBuff[sendBuff.length - 1] = sendBuff[1];

	for (var i = 0; i < data.length; i++)	{
		sendBuff[sendBuff.length - 1] += data[i];
	}

	if (responseRecieved) {
		responseFormat = getCommandResponseFormat(command);
	}

	var timeoutHandler;

	function commandResponse(data) {
		responseFormat = undefined;
		clearTimeout(timeoutHandler);
		responseRecieved(data);
	}

	if (responseFormat) {
		serialPort.once('response', commandResponse);
	}

	serialPort.write(sendBuff, function(err, result){
		if (responseFormat) {
			timeoutHandler = setTimeout(function() {
				serialPort.removeListener('response', commandResponse);
				timeouts++;
			}, 1000);
		}
		if (typeof doneSending === 'function')
			doneSending(err, result);
	});
}

YEI.prototype.enableResponseHeader = function enableResponseHeader(options, callback, responseRecieved) {
	if (Array.isArray(options)) {
		var arr = options;
		options = {};
		for(i = 0; i < arr.length; i++) {
			if			(arr[i] == 0x01) options.success = true;
			else if (arr[i] == 0x02) options.timestamp = true;
			else if (arr[i] == 0x04) options.commandEcho = true;
			else if (arr[i] == 0x08) options.checksum = true;
			else if (arr[i] == 0x10) options.logicalID = true;
			else if (arr[i] == 0x20) options.serialNumber = true;
			else if (arr[i] == 0x40) options.dataLength = true;
		}
	}

	var newHeaderFormat = Parser.start().endianess('big');

	var addedOptions = 0;
	var headerLength = 0;

	if (options.success) {
		addedOptions += 0x01;
		newHeaderFormat = newHeaderFormat.uint8('success');
		headerLength += 1;
	}

	if (options.timestamp) {
		addedOptions += 0x02;
		newHeaderFormat = newHeaderFormat.uint32('timestamp');
		headerLength += 4;
	}

	if (options.commandEcho) {
		addedOptions += 0x04;
		newHeaderFormat = newHeaderFormat.uint8('commandEcho');
		headerLength += 1;
	}

	if (options.checksum) {
		addedOptions += 0x08;
		newHeaderFormat = newHeaderFormat.uint8('checksum');
		headerLength += 1;
	}

	if (options.logicalID) {
		addedOptions += 0x10;
		newHeaderFormat = newHeaderFormat.uint8('logicalID');
		headerLength += 1;
	}

	if (options.serialNumber) {
		addedOptions += 0x20;
		newHeaderFormat = newHeaderFormat.uint32('serialNumber');
		headerLength += 4;
	}

	if (options.dataLength) {
		addedOptions += 0x40;
		newHeaderFormat = newHeaderFormat.uint8('dataLength');
		headerLength += 1;
	}

	var returnSettings = new Buffer(4);
	returnSettings.writeUIntBE(addedOptions, 0, 4);
	sendCommand(0xdd, returnSettings, callback, responseRecieved);

	headerFormat = {parser: newHeaderFormat, length: headerLength};
};

YEI.prototype.resetYEI = function resetYEI(callback, responseRecieved) {
	sendCommand(0xe2, callback, responseRecieved);
};

/*
 * options is an array up to 8 long. Each slot represents different data sent
 * Implemented:
 * 0x01 : euler Orientation
 * 0x21 : gyro
 * 0x40 : All Data (gyro, accelerometer, compass)
 * 0x25 : All Corrected Data (gyro, accelerometer, compass)
 * 0x26 : correct gyro
 * 0x27 : correct accelerometer
 * 0x28 : correct compass
 * 0x40 : All Raw Data (gyro, accelerometer, compass)
 * 0x41 : raw gyro
 * 0x42 : raw accelerometer
 * 0x43 : raw compass
 */
YEI.prototype.setStreamingOptions = function setStreamingOptions(options, callback, response) {
	var streamingOptions = new Buffer(8);
	streamingOptions.fill(0xff);

	var newFormat;

	for (var i in options) {
		if ((newFormat ? newFormat.length : 0) + getCommandResponseFormat(options[i]).length > 255) {
			console.log('Requesting more streaming data than the YEI can send. Stopping before that.');
			break;
		}

		newFormat = getCommandResponseFormat(options[i], newFormat);
		streamingOptions[i] = options[i];
	}
	streamingFormat = newFormat;

	sendCommand(0x50, streamingOptions, callback, response);
};

YEI.prototype.setStreamingTiming = function setStreamingTiming(interval, duration, startDelay, callback, responseRecieved) {
	var streamingTiming = new Buffer(12);
	streamingTiming.writeUIntBE(interval,	 0,4);
	streamingTiming.writeIntBE (duration,	 4,4);
	streamingTiming.writeUIntBE(startDelay, 8,4);
	sendCommand(0x52, streamingTiming, callback, responseRecieved);
};

YEI.prototype.startStreaming = function startStreaming(serialCallback, responseCallback, streamingCallback) {
	if (this.streamingFunc) return;
	var self = this;

	sendCommand(0x55, function(err, result) {
		serialPort.on('stream', self.streamingFunc = streamingCallback);
		serialCallback(err, result);
	}, responseCallback);
};

YEI.prototype.stopStreaming = function stopStreaming(callback, responseRecieved) {
	if (this.streamingFunc) {
		serialPort.removeListener('stream', this.streamingFunc);
		this.streamingFunc = undefined;
	}
	sendCommand(0x56, callback, responseRecieved);
};

YEI.prototype.tareCurrentOrientation = function tareCurrentOrientation(callback) {
	sendCommand(0x60, callback);
};

YEI.prototype.tareWithRotationMatrix = function (roll, yaw, pitch, cb){
	var rotationMatrix = new Buffer(36);

	rotationMatrix.writeIntBE(x11, 0,4);
	rotationMatrix.writeIntBE(x12, 4,4);
	rotationMatrix.writeIntBE(x13, 8,4);
	rotationMatrix.writeIntBE(x21,12,4);
	rotationMatrix.writeIntBE(x22,16,4);
	rotationMatrix.writeIntBE(x23,20,4);
	rotationMatrix.writeIntBE(x31,24,4);
	rotationMatrix.writeIntBE(x32,28,4);
	rotationMatrix.writeIntBE(x33,32,4);
	sendCommand(0x61, rotationMatrix, cb)
}

YEI.prototype.open = function serialPortOpen(cb) {
	//console.log('Opening serial port');
	serialPort.open(cb);
};

YEI.prototype.clearBuffer = function clearBuffer() {
	buffLen = 0;
};

module.exports = YEI;
