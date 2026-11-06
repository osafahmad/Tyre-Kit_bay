/* eslint-env jest */
// TEST-ONLY: reads input/output tensor details straight from a .tflite file
// (TFLite flatbuffer schema), so manifest entries can be checked against the
// real model in Jest, where the TFLite runtime isn't available.

import type { TensorInfo } from '../types';

// Node built-ins, typed locally: the project doesn't load Node's global types.
const { readFileSync } = require('fs') as { readFileSync(path: string): Uint8Array };
const { inflateRawSync } = require('zlib') as { inflateRawSync(data: Uint8Array): Uint8Array };

const TENSOR_TYPES: Record<number, string> = {
  0: 'float32',
  1: 'float16',
  2: 'int32',
  3: 'uint8',
  4: 'int64',
  7: 'int16',
  9: 'int8',
};

export type TfliteFileInfo = {
  inputs: (TensorInfo & { quantized: boolean })[];
  outputs: (TensorInfo & { quantized: boolean })[];
  /** Ultralytics `metadata.json` embedded in the file, if any. */
  ultralytics: Record<string, unknown> | null;
};

export function readFile(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

const utf8 = (bytes: Uint8Array): string =>
  decodeURIComponent(Array.from(bytes, b => `%${b.toString(16).padStart(2, '0')}`).join(''));

export function readTfliteFile(bytes: Uint8Array): TfliteFileInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => view.getUint32(o, true);
  const i32 = (o: number) => view.getInt32(o, true);
  const u16 = (o: number) => view.getUint16(o, true);

  const field = (table: number, index: number): number | null => {
    const vtable = table - i32(table);
    const at = 4 + index * 2;
    if (at >= u16(vtable)) return null;
    const off = u16(vtable + at);
    return off ? table + off : null;
  };
  const subTable = (table: number, index: number) => {
    const p = field(table, index);
    return p === null ? null : p + u32(p);
  };
  const vector = (table: number, index: number): { start: number; length: number } | null => {
    const p = field(table, index);
    if (p === null) return null;
    const v = p + u32(p);
    return { start: v + 4, length: u32(v) };
  };
  const tables = (table: number, index: number) => {
    const v = vector(table, index);
    return v ? Array.from({ length: v.length }, (_, k) => v.start + 4 * k + u32(v.start + 4 * k)) : [];
  };
  const ints = (table: number, index: number) => {
    const v = vector(table, index);
    return v ? Array.from({ length: v.length }, (_, k) => i32(v.start + 4 * k)) : [];
  };
  const str = (table: number, index: number) => {
    const v = vector(table, index);
    return v ? utf8(bytes.subarray(v.start, v.start + v.length)) : '';
  };

  const root = u32(0);
  const subgraph = tables(root, 2)[0]; // Model.subgraphs
  const tensors = tables(subgraph, 0); // SubGraph.tensors
  const describe = (i: number) => {
    const t = tensors[i];
    const typeAt = field(t, 1); // Tensor.type
    const q = subTable(t, 4); // Tensor.quantization
    const scales = q === null ? null : vector(q, 2); // QuantizationParameters.scale
    return {
      name: str(t, 3),
      shape: ints(t, 0),
      dataType: TENSOR_TYPES[typeAt === null ? 0 : bytes[typeAt]] ?? 'unknown',
      quantized: !!scales && scales.length > 0,
    };
  };

  return {
    inputs: ints(subgraph, 1).map(describe),
    outputs: ints(subgraph, 2).map(describe),
    ultralytics: readUltralyticsMetadata(bytes, view),
  };
}

/** Ultralytics appends a zip holding `metadata.json` to its TFLite exports. */
function readUltralyticsMetadata(bytes: Uint8Array, view: DataView): Record<string, unknown> | null {
  const u32 = (o: number) => view.getUint32(o, true);
  const u16 = (o: number) => view.getUint16(o, true);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = u16(eocd + 10);
  const dirSize = u32(eocd + 12);
  const dirOffset = u32(eocd + 16);
  // Zip offsets are relative to where the zip starts inside the .tflite file.
  const base = eocd - dirSize - dirOffset;
  let dir = base + dirOffset;
  for (let k = 0; k < entries; k++) {
    const method = u16(dir + 10);
    const compressedSize = u32(dir + 20);
    const nameLen = u16(dir + 28);
    const extraLen = u16(dir + 30);
    const commentLen = u16(dir + 32);
    const local = base + u32(dir + 42);
    if (utf8(bytes.subarray(dir + 46, dir + 46 + nameLen)) === 'metadata.json') {
      const start = local + 30 + u16(local + 26) + u16(local + 28);
      const raw = bytes.subarray(start, start + compressedSize);
      return JSON.parse(utf8(method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw));
    }
    dir += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
