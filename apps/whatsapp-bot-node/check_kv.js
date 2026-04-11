require("dotenv").config({ path: ".env.local" });
const { listConversations } = require("./src/conversation_audit_kv_store.js");
(async () => {
  try {
    const convs = await listConversations({ limit: 5 });
    console.log(JSON.stringify(convs.map(c => ({ id: c.id, lastEventAt: c.lastEventAt })), null, 2));
  } catch (err) {
    console.error(err);
  }
})();
