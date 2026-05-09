import nodeCrypto from "node:crypto";

const INVITE_TOKEN_BYTES = 12;

export function createInviteToken(cryptoImpl = nodeCrypto) {
  const source =
    cryptoImpl && typeof cryptoImpl.randomBytes === "function"
      ? cryptoImpl
      : nodeCrypto;
  return source.randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}
