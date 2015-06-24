BoxParser.metaBox.prototype.parse = function(stream) {
	this.parseFullHeader(stream);
	this.boxes = [];
	BoxParser.ContainerBox.prototype.parse.call(this, stream);
}

BoxParser.ilocBox.prototype.parse = function(stream) {
	var byte;
	this.parseFullHeader(stream);
	byte = stream.readUint8();
	this.offset_size = (byte >> 4) & 0xF;
	this.length_size = byte & 0xF;
	byte = stream.readUint8();
	this.base_offset_size = (byte >> 4) & 0xF;
	if (this.version === 1) {
		this.index_size = byte & 0xF;
	} else {
		this.index_size = 0;		
		// reserved = byte & 0xF;
	}
	this.items = [];
	var item_count = stream.readUint16();
	for (var i = 0; i < item_count; i++) {
		var item = {};
		this.items.push(item);
		item.item_ID = stream.readUint16();
		if (this.version === 1) {
			item.construction_method = (stream.readUint16() & 0xF);
		} 
		item.data_reference_index = stream.readUint16();
		switch(this.base_offset_size) {
			case 0:
				item.base_offset = 0;
				break;
			case 4:
				item.base_offset = stream.readUint32();
				break;
			case 8:
				item.base_offset = stream.readUint64();
				break;
			default:
				throw "Error reading base offset size";
		}
		var extent_count = stream.readUint16();
		item.extents = [];
		for (var j=0; j < extent_count; j++) {
			var extent = {};
			item.extents.push(extent);
			if ((this.version === 1) && (this.index_size > 0)) {
				switch(this.index_size) {
					case 0:
						extent.extent_index = 0;
						break;
					case 4:
						extent.extent_index = stream.readUint32();
						break;
					case 8:
						extent.extent_index = stream.readUint64();
						break;
					default:
						throw "Error reading extent index";
				}
			}
			switch(this.offset_size) {
				case 0:
					extent.extent_offset = 0;
					break;
				case 4:
					extent.extent_offset = stream.readUint32();
					break;
				case 8:
					extent.extent_offset = stream.readUint64();
					break;
				default:
					throw "Error reading extent index";
			}
			switch(this.length_size) {
				case 0:
					extent.extent_length = 0;
					break;
				case 4:
					extent.extent_length = stream.readUint32();
					break;
				case 8:
					extent.extent_length = stream.readUint64();
					break;
				default:
					throw "Error reading extent index";
			}
		}
	}
}

BoxParser.pitmBox.prototype.parse = function(stream) {
	this.parseFullHeader(stream);
	if (this.version === 0) {
		this.item_ID = stream.readUint16();
	} else {
		this.item_ID = stream.readUint32();
	}
}

BoxParser.iinfBox.prototype.parse = function(stream) {
	var ret;
	this.parseFullHeader(stream);
	if (this.version === 0) {
		this.entry_count = stream.readUint16();
	} else {
		this.entry_count = stream.readUint32();
	}
	this.item_infos = [];
	for (var i = 0; i < this.entry_count; i++) {
		ret = BoxParser.parseOneBox(stream);
		if (ret.box.type !== "infe") {
			Log.error("BoxParser", "Expected 'infe' box, got "+ret.box.type);
		}
		this.item_infos[i] = ret.box;
	}
}

BoxParser.infeBox.prototype.parse = function(stream) {
	this.parseFullHeader(stream);
	if (this.version === 0 || this.version === 1) {
		this.item_ID = stream.readUint16();
		this.item_protection_index = stream.readUint16();
		this.item_name = stream.readCString();
		this.content_type = stream.readCString();
		this.content_encoding = stream.readCString();
	}
	if (this.version === 1) {
		this.extension_type = stream.readString(4);
		Log.warn("BoxParser", "Cannot parse extension type");
		stream.seek(this.start+this.size);
		return;
	}
	if (this.version >= 2) {
		if (this.version === 2) {
			this.item_ID = stream.readUint16();
		} else if (this.version === 3) {
			this.item_ID = stream.readUint32();
		}
		this.item_protection_index = stream.readUint16();
		this.item_type = stream.readString(4);
		this.name = stream.readCString();
		if (this.item_type === "mime") {
			this.content_type = stream.readCString();
			this.content_encoding = stream.readCString();
		} else if (this.item_type === "uri ") {
			this.item_uri_type = stream.readCString();
		}
	}
	if (stream.position > this.start+this.size) {
		Log.warn("BoxParser", "Parsed more than the size of the box (null-terminated string problem?)");
		stream.seek(this.start+this.size);
	}
}

BoxParser.SingleItemTypeReferenceBox = function(type, size, hdr_size, start, fileStart) {
	BoxParser.Box.call(this, type, size);
	this.hdr_size = hdr_size;
	this.start = start;
	this.fileStart = fileStart;
}
BoxParser.SingleItemTypeReferenceBox.prototype = new BoxParser.Box();
BoxParser.SingleItemTypeReferenceBox.prototype.parse = function(stream) {
	this.from_item_ID = stream.readUint16();
	var count =  stream.readUint16();
	this.references = [];
	for(var i = 0; i < count; i++) {
		this.references[i] = stream.readUint16();
	}
}

BoxParser.SingleItemTypeReferenceBoxLarge = function(type, size, hdr_size, start, fileStart) {
	BoxParser.Box.call(this, type, size);
	this.hdr_size = hdr_size;
	this.start = start;
	this.fileStart = fileStart;
}
BoxParser.SingleItemTypeReferenceBoxLarge.prototype = new BoxParser.Box();
BoxParser.SingleItemTypeReferenceBoxLarge.prototype.parse = function(stream) {
	this.from_item_ID = stream.readUint32();
	var count =  stream.readUint16();
	this.references = [];
	for(var i = 0; i < count; i++) {
		this.references[i] = stream.readUint32();
	}
}

BoxParser.irefBox = function(size) {
	BoxParser.FullBox.call(this, "iref", size);
	this.references = [];
}	
BoxParser.irefBox.prototype = new BoxParser.FullBox();
BoxParser.irefBox.prototype.parse = function(stream) {
	var ret;
	var entryCount;
	var box;
	this.parseFullHeader(stream);

	while (stream.position < this.start+this.size) {
		ret = BoxParser.parseOneBox(stream, true);
		if (this.version === 0) {
			box = new BoxParser.SingleItemTypeReferenceBox(ret.type, ret.size, ret.hdr_size, ret.start, ret.fileStart);
		} else {
			box = new BoxParser.SingleItemTypeReferenceBoxLarge(ret.type, ret.size, ret.hdr_size, ret.start, ret.fileStart);
		}
		box.parse(stream);
		this.references.push(box);
	}
}
