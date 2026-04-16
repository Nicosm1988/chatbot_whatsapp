function hasWarnings(warnings) {
  return Object.values(warnings || {}).some(Boolean);
}

function buildSystemReadiness({ config, auditStorageStatus, pharmacyLookupStatus, whatsappRuntimeStatus }) {
  const transport = String(config?.whatsappTransport || "cloud");
  const isWebTransport = transport === "web";
  const webhookSignatureRequired =
    !isWebTransport && Boolean(config?.whatsappSignatureRequired) && !Boolean(config?.whatsappMockMode);
  const webhookSignatureHardened = webhookSignatureRequired && Boolean(config?.whatsappAppSecret);
  const webhookSignatureMode = isWebTransport
    ? "not_applicable"
    : Boolean(config?.whatsappMockMode)
    ? "mock"
    : webhookSignatureHardened
      ? "enforced"
      : config?.whatsappAppSecret
        ? "optional"
        : "not_configured";
  const whatsappReady = isWebTransport
    ? Boolean(config?.whatsappMockMode || whatsappRuntimeStatus?.ready)
    : Boolean(
        !config?.whatsappMockMode &&
          config?.whatsappAccessToken &&
          config?.whatsappPhoneNumberId &&
          config?.whatsappWebhookVerifyToken
      );

  const auditReady = Boolean(auditStorageStatus?.persistentStorage);
  const pharmacyLookupReady = Boolean(pharmacyLookupStatus?.ready);

  return {
    ok: whatsappReady && auditReady && pharmacyLookupReady,
    secure: isWebTransport || webhookSignatureHardened || Boolean(config?.whatsappMockMode),
    services: {
      whatsapp: {
        ready: whatsappReady,
        transport,
        authMode: String(whatsappRuntimeStatus?.authMode || ""),
        mockMode: Boolean(config?.whatsappMockMode),
        appSecretConfigured: Boolean(config?.whatsappAppSecret),
        signatureRequired: webhookSignatureRequired,
        webhookSignature: {
          hardened: webhookSignatureHardened,
          mode: webhookSignatureMode
        },
        accessTokenConfigured: Boolean(config?.whatsappAccessToken),
        phoneNumberConfigured: Boolean(config?.whatsappPhoneNumberId),
        webhookVerifyConfigured: Boolean(config?.whatsappWebhookVerifyToken),
        browserUrlConfigured: Boolean(config?.whatsappWebBrowserUrl || config?.whatsappWebBrowserWsEndpoint),
        sessionReady: Boolean(whatsappRuntimeStatus?.ready),
        sessionInitialized: Boolean(whatsappRuntimeStatus?.initialized),
        authenticated: Boolean(whatsappRuntimeStatus?.authenticated),
        fullyReady: Boolean(whatsappRuntimeStatus?.fullyReady),
        qrAvailable: Boolean(whatsappRuntimeStatus?.qrAvailable),
        awaitingScan: Boolean(whatsappRuntimeStatus?.awaitingScan),
        disconnectReason: String(whatsappRuntimeStatus?.disconnectReason || "")
      },
      auditStorage: {
        ready: auditReady,
        provider: String(auditStorageStatus?.provider || ""),
        mode: String(auditStorageStatus?.mode || ""),
        hasWarnings: hasWarnings(auditStorageStatus?.warnings)
      },
      pharmacyLookup: {
        ready: pharmacyLookupReady,
        mode: String(pharmacyLookupStatus?.mode || "document_fallback"),
        branches: Array.isArray(pharmacyLookupStatus?.branchIds) ? pharmacyLookupStatus.branchIds : [],
        fallbackMode: String(pharmacyLookupStatus?.fallbackMode || "document")
      }
    },
    security: {
      webhookSignatureHardened,
      webhookSignatureMode
    }
  };
}

module.exports = {
  buildSystemReadiness
};
