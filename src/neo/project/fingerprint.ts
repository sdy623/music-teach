/**
 * Canonical JSON-like encoding used by F0-A fingerprints.
 *
 * The hash is deterministic FNV-1a over UTF-16 code units. It is deliberately
 * labelled non-cryptographic and must not be used as a media or security hash.
 */
export function canonicalizeForFingerprint(value: unknown): string {
  return canonicalize(value, new Set<object>());
}

export function createDeterministicFingerprint(value: unknown): string {
  const canonical = canonicalizeForFingerprint(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < canonical.length; index += 1) {
    const codeUnit = canonical.charCodeAt(index);
    hash ^= BigInt(codeUnit & 0xff);
    hash = BigInt.asUintN(64, hash * prime);
    hash ^= BigInt(codeUnit >>> 8);
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `fnv1a64-utf16-noncrypto:${hash.toString(16).padStart(16, "0")}`;
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (value === undefined) return '{"$undefined":true}';

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (Number.isNaN(value)) return '{"$number":"NaN"}';
      if (value === Infinity) return '{"$number":"Infinity"}';
      if (value === -Infinity) return '{"$number":"-Infinity"}';
      if (Object.is(value, -0)) return '{"$number":"-0"}';
      return JSON.stringify(value);
    case "bigint":
      return `{"$bigint":${JSON.stringify(value.toString())}}`;
    case "function":
    case "symbol":
      throw new TypeError(`Unsupported fingerprint value: ${typeof value}`);
    case "object":
      return canonicalizeObject(value, ancestors);
  }

  throw new TypeError(`Unsupported fingerprint value: ${typeof value}`);
}

function canonicalizeObject(value: object, ancestors: Set<object>): string {
  if (ancestors.has(value)) {
    throw new TypeError("Cannot fingerprint cyclic data");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry, ancestors)).join(",")}]`;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '{"$date":"Invalid Date"}';
      return `{"$date":${JSON.stringify(value.toISOString())}}`;
    }

    if (value instanceof Map) {
      const entries = [...value.entries()].map(([key, entryValue]) => [
        canonicalize(key, ancestors),
        canonicalize(entryValue, ancestors)
      ] as const);
      entries.sort(([left], [right]) => compareText(left, right));
      return `{"$map":[${entries
        .map(([key, entryValue]) => `[${key},${entryValue}]`)
        .join(",")}]}`;
    }

    if (value instanceof Set) {
      const entries = [...value].map((entry) => canonicalize(entry, ancestors));
      entries.sort(compareText);
      return `{"$set":[${entries.join(",")}]}`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareText);
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
