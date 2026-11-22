const fs = require('fs');
const path = require('path');

const TAG = {
  END: 0,
  BYTE: 1,
  SHORT: 2,
  INT: 3,
  LONG: 4,
  FLOAT: 5,
  DOUBLE: 6,
  BYTE_ARRAY: 7,
  STRING: 8,
  LIST: 9,
  COMPOUND: 10,
  INT_ARRAY: 11,
  LONG_ARRAY: 12
};

class NbtReader {
  constructor(buffer) {
    this.buf = buffer;
    this.offset = 0;
  }

  readByte() {
    const v = this.buf.readInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readUByte() {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readShort() {
    const v = this.buf.readInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  readUShort() {
    const v = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    return v;
  }

  readInt() {
    const v = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readLong() {
    const v = this.buf.readBigInt64BE(this.offset);
    this.offset += 8;
    return v;
  }

  readFloat() {
    const v = this.buf.readFloatBE(this.offset);
    this.offset += 4;
    return v;
  }

  readDouble() {
    const v = this.buf.readDoubleBE(this.offset);
    this.offset += 8;
    return v;
  }

  readString() {
    const len = this.readUShort();
    const str = this.buf.toString('utf8', this.offset, this.offset + len);
    this.offset += len;
    return str;
  }

  readPayload(tagType) {
    switch (tagType) {
      case TAG.BYTE:
        return { type: TAG.BYTE, value: this.readByte() };
      case TAG.SHORT:
        return { type: TAG.SHORT, value: this.readShort() };
      case TAG.INT:
        return { type: TAG.INT, value: this.readInt() };
      case TAG.LONG:
        return { type: TAG.LONG, value: this.readLong() };
      case TAG.FLOAT:
        return { type: TAG.FLOAT, value: this.readFloat() };
      case TAG.DOUBLE:
        return { type: TAG.DOUBLE, value: this.readDouble() };
      case TAG.BYTE_ARRAY: {
        const len = Math.max(0, this.readInt());
        const slice = Buffer.from(this.buf.subarray(this.offset, this.offset + len));
        this.offset += len;
        return { type: TAG.BYTE_ARRAY, value: slice };
      }
      case TAG.STRING:
        return { type: TAG.STRING, value: this.readString() };
      case TAG.LIST: {
        const itemType = this.readUByte();
        const len = Math.max(0, this.readInt());
        const value = [];
        for (let i = 0; i < len; i++) {
          value.push(this.readPayload(itemType));
        }
        return { type: TAG.LIST, itemType, value };
      }
      case TAG.COMPOUND: {
        const value = {};
        while (this.offset < this.buf.length) {
          const childType = this.readUByte();
          if (childType === TAG.END) break;
          const name = this.readString();
          value[name] = this.readPayload(childType);
        }
        return { type: TAG.COMPOUND, value };
      }
      case TAG.INT_ARRAY: {
        const len = Math.max(0, this.readInt());
        const value = [];
        for (let i = 0; i < len; i++) value.push(this.readInt());
        return { type: TAG.INT_ARRAY, value };
      }
      case TAG.LONG_ARRAY: {
        const len = Math.max(0, this.readInt());
        const value = [];
        for (let i = 0; i < len; i++) value.push(this.readLong());
        return { type: TAG.LONG_ARRAY, value };
      }
      default:
        throw new Error(`Nieobsługiwany tag NBT typu ${tagType}`);
    }
  }
}

class NbtWriter {
  constructor() {
    this.chunks = [];
  }

  writeUByte(v) {
    const b = Buffer.allocUnsafe(1);
    b.writeUInt8(v & 0xff, 0);
    this.chunks.push(b);
  }

  writeByte(v) {
    const b = Buffer.allocUnsafe(1);
    b.writeInt8(Math.max(-128, Math.min(127, Number(v) || 0)), 0);
    this.chunks.push(b);
  }

  writeShort(v) {
    const b = Buffer.allocUnsafe(2);
    b.writeInt16BE(Number(v) || 0, 0);
    this.chunks.push(b);
  }

  writeUShort(v) {
    const b = Buffer.allocUnsafe(2);
    b.writeUInt16BE(Number(v) || 0, 0);
    this.chunks.push(b);
  }

  writeInt(v) {
    const b = Buffer.allocUnsafe(4);
    b.writeInt32BE(Number(v) || 0, 0);
    this.chunks.push(b);
  }

  writeLong(v) {
    const b = Buffer.allocUnsafe(8);
    b.writeBigInt64BE(typeof v === 'bigint' ? v : BigInt(v || 0), 0);
    this.chunks.push(b);
  }

  writeFloat(v) {
    const b = Buffer.allocUnsafe(4);
    b.writeFloatBE(Number(v) || 0, 0);
    this.chunks.push(b);
  }

  writeDouble(v) {
    const b = Buffer.allocUnsafe(8);
    b.writeDoubleBE(Number(v) || 0, 0);
    this.chunks.push(b);
  }

  writeString(str) {
    const textBuf = Buffer.from(String(str || ''), 'utf8');
    this.writeUShort(Math.min(65535, textBuf.length));
    this.chunks.push(textBuf.subarray(0, 65535));
  }

  writePayload(node) {
    switch (node.type) {
      case TAG.BYTE:
        this.writeByte(node.value);
        break;
      case TAG.SHORT:
        this.writeShort(node.value);
        break;
      case TAG.INT:
        this.writeInt(node.value);
        break;
      case TAG.LONG:
        this.writeLong(node.value);
        break;
      case TAG.FLOAT:
        this.writeFloat(node.value);
        break;
      case TAG.DOUBLE:
        this.writeDouble(node.value);
        break;
      case TAG.BYTE_ARRAY: {
        const buf = Buffer.isBuffer(node.value) ? node.value : Buffer.from(node.value || []);
        this.writeInt(buf.length);
        this.chunks.push(buf);
        break;
      }
      case TAG.STRING:
        this.writeString(node.value);
        break;
      case TAG.LIST: {
        const arr = Array.isArray(node.value) ? node.value : [];
        const itemType = arr.length > 0 ? node.itemType || arr[0].type : TAG.END;
        this.writeUByte(itemType);
        this.writeInt(arr.length);
        for (const item of arr) {
          this.writePayload(item);
        }
        break;
      }
      case TAG.COMPOUND: {
        const entries = Object.entries(node.value || {});
        for (const [k, child] of entries) {
          if (!child || typeof child.type !== 'number') continue;
          this.writeUByte(child.type);
          this.writeString(k);
          this.writePayload(child);
        }
        this.writeUByte(TAG.END);
        break;
      }
      case TAG.INT_ARRAY: {
        const arr = Array.isArray(node.value) ? node.value : [];
        this.writeInt(arr.length);
        for (const v of arr) this.writeInt(v);
        break;
      }
      case TAG.LONG_ARRAY: {
        const arr = Array.isArray(node.value) ? node.value : [];
        this.writeInt(arr.length);
        for (const v of arr) this.writeLong(v);
        break;
      }
      default:
        throw new Error(`Nieobsługiwany tag NBT do zapisu: ${node.type}`);
    }
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function parseRootNbt(buffer) {
  const reader = new NbtReader(buffer);
  const rootType = reader.readUByte();
  if (rootType !== TAG.COMPOUND) {
    throw new Error('Nieprawidłowy nagłówek pliku servers.dat.');
  }
  const rootName = reader.readString();
  const root = reader.readPayload(TAG.COMPOUND);
  return { rootName, root };
}

function serializeRootNbt(rootName, rootNode) {
  const writer = new NbtWriter();
  writer.writeUByte(TAG.COMPOUND);
  writer.writeString(rootName || '');
  writer.writePayload(rootNode);
  return writer.toBuffer();
}

function createEmptyRoot() {
  return {
    rootName: '',
    root: {
      type: TAG.COMPOUND,
      value: {
        servers: {
          type: TAG.LIST,
          itemType: TAG.COMPOUND,
          value: []
        }
      }
    }
  };
}

function readServersDat(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, entries: [], ...createEmptyRoot() };
  }
  try {
    const raw = fs.readFileSync(filePath);
    if (raw.length < 3) {
      return { exists: false, entries: [], ...createEmptyRoot() };
    }
    const { rootName, root } = parseRootNbt(raw);
    const listNode = root.value?.servers;
    const rawList = listNode && listNode.type === TAG.LIST && Array.isArray(listNode.value) ? listNode.value : [];
    const entries = rawList
      .filter((item) => item && item.type === TAG.COMPOUND && item.value)
      .map((item) => ({
        name: item.value.name?.value || '',
        ip: item.value.ip?.value || '',
        acceptTextures: item.value.acceptTextures?.value ?? 1,
        hasIcon: Boolean(item.value.icon?.value)
      }));
    return { exists: true, entries, rootName, root };
  } catch {
    return { exists: false, entries: [], ...createEmptyRoot() };
  }
}

function upsertServerEntry(filePath, { name, ip, acceptTextures = 1 } = {}) {
  const cleanIp = String(ip || '').trim();
  const cleanName = String(name || cleanIp || 'Serwer .peak').trim();
  if (!cleanIp) {
    throw new Error('Brak adresu IP serwera do zapisania w servers.dat.');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const parsed = readServersDat(filePath);
  const { rootName, root } = parsed;

  if (!root.value || typeof root.value !== 'object') root.value = {};
  if (!root.value.servers || root.value.servers.type !== TAG.LIST) {
    root.value.servers = { type: TAG.LIST, itemType: TAG.COMPOUND, value: [] };
  }
  root.value.servers.itemType = TAG.COMPOUND;
  const list = root.value.servers.value;

  const existing = list.find((item) => {
    if (!item || item.type !== TAG.COMPOUND || !item.value) return false;
    const itemIp = item.value.ip?.value || '';
    const itemName = item.value.name?.value || '';
    return itemIp === cleanIp || (cleanName && itemName === cleanName);
  });

  if (existing) {
    existing.value.name = { type: TAG.STRING, value: cleanName };
    existing.value.ip = { type: TAG.STRING, value: cleanIp };
    existing.value.acceptTextures = { type: TAG.BYTE, value: Number(acceptTextures) ? 1 : 0 };
  } else {
    list.unshift({
      type: TAG.COMPOUND,
      value: {
        name: { type: TAG.STRING, value: cleanName },
        ip: { type: TAG.STRING, value: cleanIp },
        acceptTextures: { type: TAG.BYTE, value: Number(acceptTextures) ? 1 : 0 }
      }
    });
  }

  const outBuf = serializeRootNbt(rootName, root);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, outBuf);
  fs.renameSync(tmpPath, filePath);

  return readServersDat(filePath).entries;
}

module.exports = {
  TAG,
  readServersDat,
  upsertServerEntry
};
