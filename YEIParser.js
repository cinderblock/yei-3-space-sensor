var Parser = require('binary-parser').Parser;
const EventEmitter = require('events');

yeiParserDebug() {
  return;
  console.log('yei parser', ...arguments);
}

class YEIParser extends EventEmitter {
  constructor(bufferSize) {
    bufferSize = bufferSize || 100;
    
    // Temporary buffer to store and parse incoming data from
    this.buffer = Buffer.allocUnsafe(bufferSize);
    this.bufferLen = 0;
		
		// Array of format objects describing the current packet format we're expecting
		this.format = [];
    
		// Array of format objects describing the current packet header format we're expecting
    this.headerFormat = [];
  }
  
  dataHandler(serialPortEmitter, data) {
    // Copy incoming data from serial port to temporary buffer
  	var cpLen = data.copy(this.buffer, this.bufferLen);
  
  	if (cpLen < data.length) {
  		this.emit('error', 'Buffer overrun');
  	}
  
  	yeiParserDebug('New data');
  	yeiParserDebug(data);
  
  	if (!responseFormat && !streamingFormat) {
  		return;
  	}
  
  	this.bufferLen += cpLen;
  
  	var headerLength;
  
  	while (this.bufferLen >= (headerLength = headerFormat.length)) {
  		yeiParserDebug(' loop');
  
  		yeiParserDebug(responseFormat);
  		yeiParserDebug(streamingFormat);
  
  		var message = {};
  		message.header = ParseBlock(this.buff, headerFormat.parser);
  
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
  			if (this.bufferLen < headerLength + message.header.dataLength) {
  				// Not enough data in the buffer yet. Wait for more
  				break;
  			}
  			// If streaming data and we have no idea waht to do with it, discard it
  			if (event == 'stream' && !format) {
  				this.buffer.copy(this.buff, 0, headerLength + message.header.dataLength);
  				this.bufferLen -= headerLength + message.header.dataLength;
  				continue;
  			}
  			if ((messageLength !== undefined) && (messageLength != message.header.dataLength)) {
  				this.emit('warning', 'Incoming message length does not match expected format.');
  				yeiParserDebug('	Incoming message length does not match expected format.');
  			}
  			messageLength = message.header.dataLength;
  		} else if (event == 'stream' && !format) {
  			// Discard streaming data. Since we don't know how long it is, drop all the data.
  			this.bufferLen = 0;
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
  					this.emit('warning', 'Incoming message length does not match either expected format.');
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
  			yeiParserDebug('	checksum', message.header.checksum, getByteSum(this.buff, headerLength, headerLength + messageLength));
  			message.valid = message.header.checksum === getByteSum(this.buff, headerLength, headerLength + messageLength);
  		}
  
  		yeiParserDebug(' body start');
  
  		message.body = ParseBlock(this.buff, format.parser, headerLength);
  
  		yeiParserDebug(' body stop');
  
  		this.emit(event, message);
  
  		yeiParserDebug(' data emitted');
  
  		this.buffer.copy(this.buff, 0, headerLength + messageLength);
  		this.bufferLen -= headerLength + messageLength;
  	}
  
  	yeiParserDebug('done');
  }
}

module.exports = YEIParser;
