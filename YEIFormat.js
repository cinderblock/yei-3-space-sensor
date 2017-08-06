

class YEIFormat {
  constructor() {
    this.format = [];
  }
  
  get byteLength() {
  	var sum = 0;
  	for (var i in this.format) {
  		sum += getElementLength(this.format[i]) * (this.format[i].arrayLength || 1);
  	}
  	return sum;
  }
  
  static getElementLength(formatElement) {
    switch (formatElement.type) {
    	case 'floatLE':
    	case 'floatBE':
        return 4;
    	case 'doubleLE':
    	case 'doubleBE':
        return 8;
    	case 'intLE':
    	case 'intBE':
    	case 'uintLE':
    	case 'uintBE':
    	case 'string':
        return formatElement.length;
    	case 'byte':
    	case 'bool':
        return 1;
    }
  }
  
  readNextData(data, format, offset) {
    switch (format.type) {
  	  case 'floatLE':
  		  return data.readFloatLE(offset);
  	  case 'floatBE':
  		  return data.readFloatBE(offset);
  	  case 'doubleLE':
  		  return data.readDoubleLE(offset);
  	  case 'doubleBE':
  		  return data.readDoubleBE(offset);
  	  case 'intLE':
  		  return data.readIntLE(offset, format.length);
  	  case 'intBE':
  		  return data.readIntBE(offset, format.length);
  	  case 'uintLE':
  		  return data.readUIntLE(offset, format.length);
  	  case 'uintBE':
  		  return data.readUIntBE(offset, format.length);
  	  case 'string':
  		  return data.toString(format.encoding, offset, offset + format.length);
  	  case 'byte':
  		  return data.readUInt8(offset);
  	  case 'bool':
  		  return data.readUInt8(offset) !== 0;
    }
  }
  
  ParseBlock(data, format, offset) {
  	// Make sure offset starts as a number
  	offset = offset || 0;
  
  	if (offset) data = data.slice(offset);
  
  	return format.parse(data);
  }
}
