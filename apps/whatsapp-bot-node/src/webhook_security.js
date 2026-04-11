const crypto = require("crypto");

function buildWebhookSignature(rawBody, appSecret) {
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  return `sha256=${crypto.createHmac("sha256", String(appSecret || "")).update(bodyBuffer).digest("hex")}`;
}

function resolveWebhookSignatureMode({ appSecret, signatureRequired, mockMode }) {
  if (mockMode) {
    return "mock";
  }
  if (appSecret && signatureRequired) {
    return "enforced";
  }
  if (appSecret) {
    return "optional";
  }
  return "not_configured";
}

function getWebhookSignatureStatus(config) {
  const configured = Boolean(config?.whatsappAppSecret);
  const required = Boolean(config?.whatsappSignatureRequired) && !Boolean(config?.whatsappMockMode);
  const mode = resolveWebhookSignatureMode({
    appSecret: config?.whatsappAppSecret,
    signatureRequired: config?.whatsappSignatureRequired,
    mockMode: config?.whatsappMockMode
  });

  return {
    configured,
    required,
    hardened: mode === "enforced",
    mode
  };
}

function validateWebhookSignature({ appSecret, signatureHeader, rawBody, signatureRequired = false, mockMode = false }) {
  const mode = resolveWebhookSignatureMode({ appSecret, signatureRequired, mockMode });

  if (mode === "mock") {
    return { valid: true, reason: "mock_mode", mode };
  }

  if (!appSecret) {
    if (signatureRequired) {
      return { valid: false, reason: "missing_app_secret", mode };
    }
    return { valid: true, reason: "app_secret_not_configured", mode };
  }

  if (!signatureHeader) {
    return { valid: false, reason: "missing_signature", mode };
  }

  if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    return { valid: false, reason: "missing_raw_body", mode };
  }

  if (!String(signatureHeader).startsWith("sha256=")) {
    return { valid: false, reason: "invalid_signature_format", mode };
  }

  const expected = buildWebhookSignature(rawBody, appSecret);
  const actualBuffer = Buffer.from(String(signatureHeader), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: "invalid_signature", mode };
  }

  if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { valid: false, reason: "invalid_signature", mode };
  }

  return { valid: true, reason: "verified", mode };
}

module.exports = {
  buildWebhookSignature,
  getWebhookSignatureStatus,
  validateWebhookSignature
};
