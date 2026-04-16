const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSystemReadiness } = require("./runtime_readiness");

test("system readiness queda listo cuando whatsapp, storage y plex estan configurados", () => {
  const result = buildSystemReadiness({
    config: {
      whatsappTransport: "cloud",
      whatsappMockMode: false,
      whatsappAccessToken: "token",
      whatsappPhoneNumberId: "phone-id",
      whatsappWebhookVerifyToken: "verify-token",
      whatsappAppSecret: "secret",
      whatsappSignatureRequired: true
    },
    auditStorageStatus: {
      provider: "postgres",
      mode: "postgres",
      persistentStorage: true,
      warnings: {}
    },
    pharmacyLookupStatus: {
      ready: true,
      mode: "plex_center_api",
      branchIds: ["1"],
      fallbackMode: "document"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.secure, true);
  assert.deepEqual(result.services.pharmacyLookup.branches, ["1"]);
  assert.equal(result.services.whatsapp.ready, true);
  assert.equal(result.services.whatsapp.signatureRequired, true);
  assert.equal(result.services.whatsapp.webhookSignature.hardened, true);
  assert.equal(result.services.auditStorage.ready, true);
});

test("system readiness marca no listo cuando falta la integracion de farmacia", () => {
  const result = buildSystemReadiness({
    config: {
      whatsappTransport: "cloud",
      whatsappMockMode: false,
      whatsappAccessToken: "token",
      whatsappPhoneNumberId: "phone-id",
      whatsappWebhookVerifyToken: "verify-token",
      whatsappAppSecret: "",
      whatsappSignatureRequired: false
    },
    auditStorageStatus: {
      provider: "postgres",
      mode: "postgres",
      persistentStorage: true,
      warnings: {}
    },
    pharmacyLookupStatus: {
      ready: false,
      mode: "document_fallback",
      branchIds: [],
      fallbackMode: "document"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.secure, false);
  assert.equal(result.services.pharmacyLookup.ready, false);
  assert.equal(result.services.whatsapp.appSecretConfigured, false);
  assert.equal(result.security.webhookSignatureMode, "not_configured");
});

test("system readiness usa la sesion de whatsapp web cuando el transporte es web", () => {
  const result = buildSystemReadiness({
    config: {
      whatsappTransport: "web",
      whatsappMockMode: false,
      whatsappAccessToken: "",
      whatsappPhoneNumberId: "",
      whatsappWebhookVerifyToken: "",
      whatsappAppSecret: "",
      whatsappSignatureRequired: false
    },
    auditStorageStatus: {
      provider: "postgres",
      mode: "postgres",
      persistentStorage: true,
      warnings: {}
    },
    pharmacyLookupStatus: {
      ready: true,
      mode: "plex_center_api",
      branchIds: ["1"],
      fallbackMode: "document"
    },
    whatsappRuntimeStatus: {
      initialized: true,
      ready: true,
      disconnectReason: ""
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.secure, true);
  assert.equal(result.services.whatsapp.transport, "web");
  assert.equal(result.services.whatsapp.sessionInitialized, true);
  assert.equal(result.services.whatsapp.sessionReady, true);
  assert.equal(result.services.whatsapp.signatureRequired, false);
  assert.equal(result.security.webhookSignatureMode, "not_applicable");
});
