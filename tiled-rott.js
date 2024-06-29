//
// Rise of the Triad support for Tiled
//
// Copyright (c) 2024 erysdren (it/she/they)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//

const rtlMagic = "RTL\0";
const rtcMagic = "RTC\0";
const rtrMagic = "RTR\0";
const rxlMagic = "RXL\0";
const rxcMagic = "RXC\0";
const rtlVersion = 0x0101;

function bytesToUInt32(arr) {
	view = new DataView(arr);
	return view.getUInt32(0, true);
}

function bytesToUInt16(arr) {
	view = new DataView(arr);
	return view.getUInt16(0, true);
}

function bytesToString(arr, length) {

	const chars = [];
	const view = new DataView(arr);

	for (let i = 0; i < length; i++) {
		if (view.getUint8(i) == 0) {
			break;
		} else {
			chars.push(view.getUint8(i));
		}
	}

	return String.fromCharCode(...chars);
}

function rottDecodePlane(buffer, offset, size, tag, tileEditLayer, tileSet) {

	// seek to pos
	buffer.seek(offset);

	// read plane data
	const plane = buffer.read(size);
	const planeView = new DataView(plane)

	const decompressedSize = 128 * 128;
	let decompressed = new Uint16Array(decompressedSize);

	// read data from source
	let readPos = 0;
	let decompressedPos = 0;
	while (readPos < size && decompressedPos < decompressedSize) {

		let test = planeView.getUInt16(readPos, true)
		readPos += 2;

		// its an rle tag
		if (test == tag) {
			rleLen = planeView.getUInt16(readPos, true);
			readPos += 2;
			rleValue = planeView.getUInt16(readPos, true);
			readPos += 2;

			// write run-length encoded value
			for (let i = 0; i < rleLen; i++) {
				decompressed[decompressedPos] = rleValue;
				decompressedPos++;
			}
		} else {
			// write normal value
			decompressed[decompressedPos] = test;
			decompressedPos++;
		}
	}

	// write map data
	for (let y = 0; y < 128; y++) {
		for (let x = 0; x < 128; x++) {
			if (decompressed[y * 128 + x] > 0) {
				tileEditLayer.setTile(x, y, tileSet.tiles[decompressed[y * 128 + x]]);
			}
		}
	}
}

function rottRead(fileName) {

	// open input file
	const mapBuffer = new BinaryFile(fileName);

	// check magic
	const mapMagic = mapBuffer.read(4);
	if (mapMagic == rtlMagic) {
		console.log("\"" + fileName + "\" is a singleplayer ROTT mapset")
	} else if (mapMagic == rtcMagic) {
		console.log("\"" + fileName + "\" is a multiplayer ROTT mapset")
	} else if (mapMagic == rtrMagic) {
		console.log("\"" + fileName + "\" is a randomly generated ROTT mapset")
	} else if (mapMagic == rxlMagic) {
		console.log("\"" + fileName + "\" is a singleplayer ROTT mapset from ROTT:LE")
	} else if (mapMagic == rxcMagic) {
		console.log("\"" + fileName + "\" is a multiplayer ROTT mapset from ROTT:LE")
	} else {
		throw new Error("Invalid magic identifier \"" + mapMagic + "\"");
	}

	// check version
	const mapVersion = bytesToUInt32(mapBuffer.read(4));
	if (mapVersion != rtlVersion) {
		throw new Error("Invalid version number 0x" + mapVersion.toString(16));
	}

	// choose map to load
	const mapNumStr = tiled.prompt("Enter map number (0-99)", "0", "Load ROTT Map (0-99)");
	const mapNum = parseInt(mapNumStr, 10);
	if (mapNum < 0 || mapNum >= 100) {
		throw new Error("Invalid map number");
	}

	// seek to map headers
	mapBuffer.seek(64 * mapNum + 8)

	let mapPlaneOffsets = [0, 0, 0];
	let mapPlaneSizes = [0, 0, 0];

	// read map header
	const mapUsed = bytesToUInt32(mapBuffer.read(4));
	const mapCrc = bytesToUInt32(mapBuffer.read(4));
	const mapTag = bytesToUInt32(mapBuffer.read(4));
	const mapFlags = bytesToUInt32(mapBuffer.read(4));
	mapPlaneOffsets[0] = bytesToUInt32(mapBuffer.read(4));
	mapPlaneOffsets[1] = bytesToUInt32(mapBuffer.read(4));
	mapPlaneOffsets[2] = bytesToUInt32(mapBuffer.read(4));
	mapPlaneSizes[0] = bytesToUInt32(mapBuffer.read(4));
	mapPlaneSizes[1] = bytesToUInt32(mapBuffer.read(4));
	mapPlaneSizes[2] = bytesToUInt32(mapBuffer.read(4));
	const mapName = bytesToString(mapBuffer.read(24), 24);

	if (mapUsed) {
		console.log("Loading existing map \"" + mapName + "\"")
	}

	// create tilemap
	const tm = new TileMap();
	tm.setSize(128, 128);
	tm.setTileSize(16, 16);
	tm.orientation = TileMap.Orthogonal;

	// add custom properties
	tm.setProperty("Map Name", mapName);
	tm.setProperty("Map Index", Math.floor(mapNum));

	// create tilesets
	const wallsTileSet = new Tileset("rott_walls");
	wallsTileSet.setTileSize(16, 16);
	wallsTileSet.image = "ext:rott_walls.png";
	tm.addTileset(wallsTileSet);

	const spritesTileSet = new Tileset("rott_sprites");
	spritesTileSet.setTileSize(16, 16);
	spritesTileSet.image = "ext:rott_sprites.png";
	tm.addTileset(spritesTileSet);

	// create layers
	const wallsLayer = new TileLayer("walls");
	wallsLayer.width = 128;
	wallsLayer.height = 128;
	const wallsEdit = wallsLayer.edit();

	const spritesLayer = new TileLayer("sprites");
	spritesLayer.width = 128;
	spritesLayer.height = 128;
	const spritesEdit = spritesLayer.edit();

	const infosLayer = new TileLayer("infos");
	infosLayer.width = 128;
	infosLayer.height = 128;
	const infosEdit = infosLayer.edit();

	// decode layers
	rottDecodePlane(mapBuffer, mapPlaneOffsets[0], mapPlaneSizes[0], mapTag, wallsEdit, wallsTileSet);
	rottDecodePlane(mapBuffer, mapPlaneOffsets[1], mapPlaneSizes[1], mapTag, spritesEdit, spritesTileSet);
	// rottDecodePlane(mapBuffer, mapPlaneOffsets[2], mapPlaneSizes[2], mapTag, infosEdit);

	wallsEdit.apply();
	spritesEdit.apply();
	infosEdit.apply();
	tm.addLayer(wallsLayer);
	tm.addLayer(spritesLayer);
	tm.addLayer(infosLayer);

	return tm;
}

function rottWrite(map, fileName) {
	console.warn("rottWrite() is not yet implemented.");
	return undefined;
}

const rottFormat = {
	name: "Rise of the Triad",
	extension: "rtl",
	read: rottRead,
	write: rottWrite
};

tiled.registerMapFormat("rott", rottFormat);
