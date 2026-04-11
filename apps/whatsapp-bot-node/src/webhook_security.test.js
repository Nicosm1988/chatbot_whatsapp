const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWebhookSignature,
  getWebhookSignatureStatus,
  validateWebhookSignature
} = require("./webhook_security");

test("validateWebhookSignature acepta una firma valida", () => {
  const rawBody = Buffer.from(JSON.stringify({ hello: "world" }));
  const signature = buildWebhookSignature(rawBody, "super-secret");

  const result = validateWebhookSignature({
    appSecret: "super-secret",
    signatureHeader: signature,
    rawBody,
    signatureRequired: true
  });

  assert.deepEqual(result, {
    valid: true,
    reason: "verified",
    mode: "enforced"
  });
});

test("validateWebhookSignature rechaza firma invalida", () => {
  const result = validateWebhookSignature({
    appSecret: "super-secret",
    signatureHeader: "sha256=bad-signature",
    rawBody: Buffer.from("payload"),
    signatureRequired: true
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, "invalid_signature");
  assert.equal(result.mode, "enforced");
});

test("validateWebhookSignature permite trafico si el secreto aun no esta configurado y no se exige", () => {
  const result = validateWebhookSignature({
    appSecret: "",
    signatureHeader: "",
    rawBody: Buffer.from("payload"),
    signatureRequired: false
  });

  assert.deepEqual(result, {
    valid: true,
    reason: "app_secret_not_configured",
    mode: "not_configured"
  });
});

test("validateWebhookSignature rechaza si se exige firma pero falta el secreto", () => {
  const result = validateWebhookSignature({
    appSecret: "",
    signatureHeader: "",
    rawBody: Buffer.from("payload"),
    signatureRequired: true
  });

  assert.deepEqual(result, {
    valid: false,
    reason: "missing_app_secret",
    mode: "not_configured"
  });
});

test("getWebhookSignatureStatus distingue modo enforced", () => {
  const status = getWebhookSignatureStatus({
    whatsappAppSecret: "secret",
    whatsappSignatureRequired: true,
    whatsappMockMode: false
  });

  assert.deepEqual(status, {
    configured: true,
    required: true,
    hardened: true,
    mode: "enforced"
  });
});
