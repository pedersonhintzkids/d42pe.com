function toHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function constantTimeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([sha256Hex(left), sha256Hex(right)]);
  let difference = leftHash.length ^ rightHash.length;
  const length = Math.max(leftHash.length, rightHash.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftHash.charCodeAt(index) || 0) ^ (rightHash.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function isAdminAuthorized(request, secret) {
  if (typeof secret !== "string" || secret.length < 32) return false;
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice(7), secret);
}
