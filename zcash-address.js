const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONSTANT = 0x2bc830a3;
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = (((checksum & 0x1ffffff) << 5) ^ value) >>> 0;
    for (let bit = 0; bit < 5; bit += 1) {
      if ((high >>> bit) & 1) checksum = (checksum ^ BECH32_GENERATORS[bit]) >>> 0;
    }
  }
  return checksum >>> 0;
}

function expandHrp(hrp) {
  return [
    ...Array.from(hrp, (character) => character.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, (character) => character.charCodeAt(0) & 31),
  ];
}

export function validUnifiedAddress(value) {
  const input = value.trim();
  if (input.length < 69 || input.length > 1000) return false;
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) return false;

  const address = input.toLowerCase();
  const separator = address.lastIndexOf("1");
  if (separator !== 1 || address.slice(0, separator) !== "u" || separator + 7 > address.length) return false;

  const data = Array.from(address.slice(separator + 1), (character) => BECH32_CHARSET.indexOf(character));
  if (data.some((valuePart) => valuePart < 0)) return false;
  return polymod([...expandHrp("u"), ...data]) === BECH32M_CONSTANT;
}
