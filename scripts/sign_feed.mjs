#!/usr/bin/env node
/**
 * Sign feed/feed.json with the maintainer's Ed25519 key.
 *
 * The other half of the pinned FEED_PUBKEY_PEM in bin/driftcite.mjs: the
 * clock runs this after build_feed.py, and a client will not use a live
 * feed whose signature does not verify against that pin. The private key
 * lives at ~/.driftcite/feed-key.pem — outside every checkout, never
 * committed, readable by the LaunchAgent because it is in $HOME but not
 * under a TCC-protected directory.
 *
 *   node scripts/sign_feed.mjs --init   generate a keypair if none exists,
 *                                       print the public half for pinning
 *   node scripts/sign_feed.mjs          sign feed/feed.json -> feed.json.sig
 *
 * Signing verifies its own output against the repository's pinned key
 * before writing, so a key mismatch fails here — where the maintainer is —
 * rather than silently downgrading every user to the bundled feed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { generateKeyPairSync, createPrivateKey, sign, verify } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FEED = path.join(ROOT, "feed", "feed.json");
const SIG = `${FEED}.sig`;
const KEY_PATH =
  process.env.DRIFTCITE_FEED_KEY || path.join(os.homedir(), ".driftcite", "feed-key.pem");

if (process.argv.includes("--init")) {
  if (existsSync(KEY_PATH)) {
    console.log(`key already exists at ${KEY_PATH}; not overwriting`);
  } else {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    writeFileSync(KEY_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), {
      mode: 0o600,
    });
    console.log(`private key written to ${KEY_PATH} (mode 600)`);
    console.log("public key to pin in bin/driftcite.mjs:");
    console.log(publicKey.export({ type: "spki", format: "pem" }));
  }
  process.exit(0);
}

if (!existsSync(KEY_PATH)) {
  console.error(`no signing key at ${KEY_PATH}; run with --init first`);
  process.exit(1);
}

const key = createPrivateKey(readFileSync(KEY_PATH));
const bytes = readFileSync(FEED);
const signature = sign(null, bytes, key);

// The pin in the shipped client is the truth the signature must satisfy;
// check against it now so a rotated or mismatched key cannot publish a feed
// every client will refuse.
const cli = readFileSync(path.join(ROOT, "bin", "driftcite.mjs"), "utf8");
const pinned = /const FEED_PUBKEY_PEM = `([^`]+)`/.exec(cli)?.[1];
if (!pinned || pinned.includes("__DRIFTCITE_FEED_PUBKEY__")) {
  console.error("bin/driftcite.mjs carries no pinned public key; pin one before signing");
  process.exit(1);
}
import("node:crypto").then(({ createPublicKey }) => {
  if (!verify(null, bytes, createPublicKey(pinned), signature)) {
    console.error("signature does not verify against the key pinned in bin/driftcite.mjs;");
    console.error("the key at ~/.driftcite/feed-key.pem is not the pinned key's other half");
    process.exit(1);
  }
  writeFileSync(SIG, signature.toString("base64") + "\n");
  console.log(`signed ${path.relative(ROOT, FEED)} -> ${path.relative(ROOT, SIG)}`);
});
