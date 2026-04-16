const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const MODULE_PATH = path.join(__dirname, "pharmacy_system_lookup.js");

function jsonResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

async function withLookupModule(env, run) {
  const previousEnv = {};
  const managedKeys = [
    "PHARMACY_SYSTEM_API_BASE_URL",
    "PHARMACY_SYSTEM_API_USERNAME",
    "PHARMACY_SYSTEM_API_PASSWORD",
    "PHARMACY_SYSTEM_API_BRANCH_IDS",
    "PHARMACY_SYSTEM_API_PRODUCTS_PER_PAGE",
    "PHARMACY_SYSTEM_API_STOCKS_PER_PAGE",
    "PHARMACY_SYSTEM_API_PRODUCT_SEARCH_PAGE_LIMIT",
    "PHARMACY_SYSTEM_API_PRODUCT_OPTION_LIMIT",
    "PHARMACY_SYSTEM_API_CACHE_TTL_MS",
    "PHARMACY_SYSTEM_LOOKUP_URL_TEMPLATE",
    "PHARMACY_SYSTEM_API_TOKEN",
    "PHARMACY_SYSTEM_API_AUTH_HEADER",
    "PHARMACY_SYSTEM_API_TIMEOUT_MS",
    "PHARMACY_SYSTEM_API_FAILURE_COOLDOWN_MS"
  ];
  const keys = Array.from(new Set([...managedKeys, ...Object.keys(env)]));
  for (const key of keys) {
    previousEnv[key] = process.env[key];
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      process.env[key] = env[key];
    } else {
      delete process.env[key];
    }
  }

  delete require.cache[require.resolve(MODULE_PATH)];
  const previousFetch = global.fetch;

  try {
    const module = require(MODULE_PATH);
    await run(module);
  } finally {
    global.fetch = previousFetch;
    delete require.cache[require.resolve(MODULE_PATH)];
    for (const key of keys) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
  }
}

test("plex center lookup usa basic auth y agrega stock entre ambas sucursales", async () => {
  const requests = [];

  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1,2"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async (url, options = {}) => {
        requests.push({ url, options });

        if (String(url).includes("/productos?")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  {
                    codproducto: "1019200382",
                    producto: "MOUNJARO 2.5 mg/0.6 mLx1 KwikPen",
                    precio: "629116,25"
                  },
                  {
                    codproducto: "1019200383",
                    producto: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
                    precio: "854050,07"
                  }
                ]
              }
            }
          });
        }

        if (String(url).includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [
                  { idsucursal: "1", sucursal: "FARMACIA DELKO 1" },
                  { idsucursal: "2", sucursal: "FARMACIA DELKO 2" }
                ]
              }
            }
          });
        }

        if (String(url).includes("/stock?sucursal=1")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                total_paginas: "1",
                productos: [
                  { codproducto: "1019200383", cajas: "0", unidades: "0" }
                ]
              }
            }
          });
        }

        if (String(url).includes("/stock?sucursal=2")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                total_paginas: "1",
                productos: [
                  { codproducto: "1019200383", cajas: "3", unidades: "0" }
                ]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });

      assert.equal(result.source, "api");
      assert.equal(result.productId, "mounjaro_5_kwikpen");
      assert.equal(result.title, "MOUNJARO 5 mg/0.6 mLx1 KwikPen");
      assert.equal(result.available, true);
      assert.equal(result.publicPrice, 854050.07);
      assert.match(result.note, /^Stock por sucursal:/i);
      assert.match(result.note, /FARMACIA DELKO 1/i);
      assert.match(result.note, /FARMACIA DELKO 2: 3 cajas/i);
      assert.doesNotMatch(result.note, /Precio validado por Plex Center/i);

      const authHeaders = requests.map(entry => entry.options?.headers?.Authorization).filter(Boolean);
      assert.ok(authHeaders.length >= 3);
      assert.ok(authHeaders.every(value => value === "Basic ZGVtb191c2VyOmRlbW9fcGFzcw=="));
    }
  );
});

test("searchProductOptions filtra coincidencias espurias y permite categorias genericas", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ searchProductOptions }) => {
      global.fetch = async url => {
        const value = String(url);
        if (value.includes("/productos?") && value.includes("busqueda=shampoo") && value.includes("paginanro=1")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  { codproducto: "1", producto: "CLOB-X SHAMPOO 0.05% x 125 ml", precio: "12000,00" },
                  { codproducto: "2", producto: "RIBATRA 0.05% SHAMPOO x 150 ml", precio: "13200,00" }
                ]
              }
            }
          });
        }

        if (value.includes("/productos?") && value.includes("busqueda=shampoo") && value.includes("paginanro=2")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  { codproducto: "3", producto: "PIROCTOL AS SHAMPOO 120 ML", precio: "9800,00" },
                  { codproducto: "4", producto: "CREMA ENJUAGUE CAPILAR", precio: "8700,00" }
                ]
              }
            }
          });
        }

        if (value.includes("/productos?") && value.includes("busqueda=shampoo") && value.includes("paginanro=3")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: { productos: [] }
            }
          });
        }

        if (value.includes("/productos?") && (value.includes("busqueda=Dove") || value.includes("busqueda=dove"))) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  { codproducto: "5", producto: "INMUNOGLOBULINA G ENDOVENOSA UNC 500 mg", precio: "238287,55" },
                  { codproducto: "6", producto: "DOVE SHAMPOO OLEO NUTRICION 400 ML", precio: "9100,00" }
                ]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const shampooOptions = await searchProductOptions({ query: "un shampoo", limit: 10 });
      assert.deepEqual(
        shampooOptions.map(item => item.title),
        [
          "CLOB-X SHAMPOO 0.05% x 125 ml",
          "PIROCTOL AS SHAMPOO 120 ML",
          "RIBATRA 0.05% SHAMPOO x 150 ml"
        ]
      );

      const doveOptions = await searchProductOptions({ query: "Dove", limit: 10 });
      assert.deepEqual(
        doveOptions.map(item => item.title),
        ["DOVE SHAMPOO OLEO NUTRICION 400 ML"]
      );
    }
  );
});

test("searchProductOptions tolera typos chicos en categorias genericas", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ searchProductOptions }) => {
      global.fetch = async url => {
        const value = String(url);

        if (
          value.includes("/productos?")
          && (value.includes("busqueda=shamppo") || value.includes("busqueda=un+shamppo"))
          && value.includes("paginanro=1")
        ) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: { productos: [] }
            }
          });
        }

        if (value.includes("/productos?") && value.includes("busqueda=shampo") && value.includes("paginanro=1")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  { codproducto: "1", producto: "CLOB-X SHAMPOO 0.05% x 125 ml", precio: "12000,00" },
                  { codproducto: "2", producto: "PIROCTOL AS SHAMPOO 120 ML", precio: "9800,00" }
                ]
              }
            }
          });
        }

        if (value.includes("/productos?") && value.includes("busqueda=shampo") && value.includes("paginanro=2")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: { productos: [] }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const options = await searchProductOptions({ query: "un shamppo", limit: 10 });
      assert.deepEqual(
        options.map(item => item.title),
        [
          "CLOB-X SHAMPOO 0.05% x 125 ml",
          "PIROCTOL AS SHAMPOO 120 ML"
        ]
      );
    }
  );
});

test("searchProductOptions permite buscar por droga usando el snapshot local de Plex", async () => {
  let fetchCalls = 0;

  await withLookupModule({}, async ({ searchProductOptions }) => {
    global.fetch = async () => {
      fetchCalls += 1;
      throw new Error("drug snapshot search should not hit fetch");
    };

    const options = await searchProductOptions({ query: "tirzepatida", mode: "drug", limit: 10 });
    assert.ok(options.length > 0);
    assert.ok(options.some(option => /MOUNJARO/i.test(option.title)));
    assert.ok(options.every(option => option.source === "api_snapshot"));
  });

  assert.equal(fetchCalls, 0);
});

test("la busqueda por droga ignora unidades y dosis accesorias", async () => {
  await withLookupModule({}, async ({ searchProductOptions }) => {
    const options = await searchProductOptions({ query: "semaglutida 1 mg", mode: "drug", limit: 10 });
    assert.ok(options.length > 0);
    assert.ok(options.some(option => /DUTIDE|OBETIDE/i.test(option.title)));
  });
});

test("lookupProductAvailability respeta el producto elegido y no vuelve a buscar otro", async () => {
  const requests = [];

  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async url => {
        requests.push(String(url));

        if (String(url).includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [{ idsucursal: "1", sucursal: "FARMACIA DELKO 1" }]
              }
            }
          });
        }

        if (String(url).includes("/stock?sucursal=1")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                total_paginas: "1",
                productos: [{ codproducto: "rx1", cajas: "4", unidades: "0" }]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({
        query: "Rexona",
        selectedProduct: {
          code: "rx1",
          title: "REXONA ANTITRANSP M SENSITIVE X 89GR",
          publicPrice: 4645.76,
          source: "api"
        }
      });

      assert.equal(result.title, "REXONA ANTITRANSP M SENSITIVE X 89GR");
      assert.equal(result.available, true);
      assert.equal(result.publicPrice, 4645.76);
      assert.ok(requests.every(url => !url.includes("/productos?")));
    }
  );
});

test("expone estado listo cuando plex center esta configurado", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1,2"
    },
    async ({ getPharmacyLookupStatus }) => {
      assert.deepEqual(getPharmacyLookupStatus(), {
        ready: true,
        mode: "plex_center_api",
        plexCenterConfigured: true,
        genericApiConfigured: false,
        branchIds: ["1", "2"],
        productsPerPage: 20,
        failureCooldownMs: 20000,
        plexCircuitOpen: false,
        genericCircuitOpen: false,
        fallbackMode: "document"
      });
    }
  );
});

test("usa Delko 1 por defecto cuando no se define sucursal en env", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass"
    },
    async ({ getPharmacyLookupStatus }) => {
      assert.deepEqual(getPharmacyLookupStatus(), {
        ready: true,
        mode: "plex_center_api",
        plexCenterConfigured: true,
        genericApiConfigured: false,
        branchIds: ["1"],
        productsPerPage: 20,
        failureCooldownMs: 20000,
        plexCircuitOpen: false,
        genericCircuitOpen: false,
        fallbackMode: "document"
      });
    }
  );
});

test("plex center marca sin stock cuando ambas sucursales responden en cero", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1,2"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async url => {
        if (String(url).includes("/productos?")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  {
                    codproducto: "1019200383",
                    producto: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
                    precio: "854050,07"
                  }
                ]
              }
            }
          });
        }

        if (String(url).includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [
                  { idsucursal: "1", sucursal: "FARMACIA DELKO 1" },
                  { idsucursal: "2", sucursal: "FARMACIA DELKO 2" }
                ]
              }
            }
          });
        }

        if (String(url).includes("/stock?sucursal=1") || String(url).includes("/stock?sucursal=2")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                total_paginas: "1",
                productos: [
                  { codproducto: "1019200383", cajas: "0", unidades: "0" }
                ]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });

      assert.equal(result.source, "api");
      assert.equal(result.available, false);
      assert.match(result.note, /sin stock/i);
    }
  );
});

test("si plex repite la pagina 1 deja el stock como no confirmado", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async url => {
        if (String(url).includes("/productos?")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  {
                    codproducto: "1019200383",
                    producto: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
                    precio: "854050,07"
                  }
                ]
              }
            }
          });
        }

        if (String(url).includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [{ idsucursal: "1", sucursal: "FARMACIA DELKO 1" }]
              }
            }
          });
        }

        if (String(url).includes("/stock?sucursal=1&paginanro=1") && String(url).includes("paginacant=")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                paginanro: "1",
                total_paginas: "3",
                productos: [{ codproducto: "111", cajas: "0", unidades: "0" }]
              }
            }
          });
        }

        if (String(url).includes("/stock?sucursal=1&paginanro=2") && String(url).includes("paginacant=")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                paginanro: "1",
                total_paginas: "3",
                productos: [{ codproducto: "111", cajas: "0", unidades: "0" }]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });

      assert.equal(result.source, "api");
      assert.equal(result.available, null);
      assert.match(result.note, /^Stock:/i);
      assert.match(result.note, /A pedido/i);
      assert.doesNotMatch(result.note, /Precio validado por Plex Center/i);
    }
  );
});

test("consulta stock con paginanro y paginacant y puede encontrar el producto en una pagina posterior", async () => {
  const requests = [];

  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async url => {
        const value = String(url);
        requests.push(value);

        if (value.includes("/productos?")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  {
                    codproducto: "222",
                    producto: "MOUNJARO 5 mg/0.6 mLx1 KwikPen",
                    precio: "854050,07"
                  }
                ]
              }
            }
          });
        }

        if (value.includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [{ idsucursal: "1", sucursal: "FARMACIA DELKO 1" }]
              }
            }
          });
        }

        if (value.includes("/stock?sucursal=1&paginanro=1") && value.includes("paginacant=1000")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                paginanro: "1",
                total_paginas: "2",
                total_productos: "1500",
                productos: [{ codproducto: "111", cajas: "0", unidades: "0" }]
              }
            }
          });
        }

        if (value.includes("/stock?sucursal=1&paginanro=2") && value.includes("paginacant=1000")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                paginanro: "2",
                total_paginas: "2",
                total_productos: "1500",
                productos: [{ codproducto: "222", cajas: "2", unidades: "0" }]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });

      assert.equal(result.available, true);
      assert.match(result.note, /2 cajas/i);
      assert.ok(requests.some(url => url.includes("/stock?sucursal=1&paginanro=1")));
      assert.ok(requests.some(url => url.includes("/stock?sucursal=1&paginanro=2")));
      assert.ok(requests.filter(url => url.includes("/stock?sucursal=1")).every(url => url.includes("paginacant=1000")));
    }
  );
});

test("si stock devuelve error del sistema visible deja el estado como A pedido", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async url => {
        const value = String(url);

        if (value.includes("/productos?")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  {
                    codproducto: "333",
                    producto: "CLOB-X SHAMPOO 0.05% shamp.x 125 ml",
                    precio: "32532,49"
                  }
                ]
              }
            }
          });
        }

        if (value.includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [{ idsucursal: "1", sucursal: "FARMACIA DELKO 1" }]
              }
            }
          });
        }

        if (value.includes("/stock?sucursal=1")) {
          return {
            ok: false,
            async text() {
              return "403 Forbidden";
            }
          };
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({ query: "CLOB-X SHAMPOO 0.05% 125 ml" });

      assert.equal(result.available, null);
      assert.match(result.note, /^Stock:/i);
      assert.match(result.note, /A pedido/i);
    }
  );
});

test("si no hay stock deja alternativas de la misma droga para retomar con asesor", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async url => {
        const value = String(url);

        if (value.includes("/productos?")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                productos: [
                  {
                    codproducto: "1007900027",
                    producto: "ABACAVIR ELEA 300 mg comp.rec.x 60",
                    precio: "103336,20",
                    coddroga: "1329"
                  }
                ]
              }
            }
          });
        }

        if (value.includes("/sucursales")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                sucursales: [
                  { idsucursal: "1", sucursal: "FARMACIA DELKO 1" }
                ]
              }
            }
          });
        }

        if (value.includes("/stock?sucursal=1")) {
          return jsonResponse({
            response: {
              respcode: "0",
              respmsg: "",
              content: {
                total_paginas: "1",
                productos: [
                  { codproducto: "1007900027", cajas: "0", unidades: "0" }
                ]
              }
            }
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      };

      const result = await lookupProductAvailability({ query: "abacavir" });

      assert.equal(result.available, false);
      assert.match(result.note, /sin stock/i);
      assert.equal(result.drugTitle, "abacavir");
      assert.ok(Array.isArray(result.alternatives));
      assert.ok(result.alternatives.length > 0);
      assert.ok(result.alternatives.some(option => /virocavir|ziagenavir/i.test(option.title)));
    }
  );
});

test("si plex center falla vuelve al documento oficial", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1,2"
    },
    async ({ lookupProductAvailability }) => {
      global.fetch = async () => {
        throw new Error("connect ECONNREFUSED");
      };

      const result = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });

      assert.equal(result.source, "document_fallback");
      assert.equal(result.available, null);
      assert.equal(result.publicPrice, 829980.63);
      assert.match(result.note, /documento oficial temporal/i);
    }
  );
});

test("si plex acaba de fallar evita reintentar hasta que pase el cooldown", async () => {
  await withLookupModule(
    {
      PHARMACY_SYSTEM_API_BASE_URL: "http://plex.example:8081",
      PHARMACY_SYSTEM_API_USERNAME: "demo_user",
      PHARMACY_SYSTEM_API_PASSWORD: "demo_pass",
      PHARMACY_SYSTEM_API_BRANCH_IDS: "1,2",
      PHARMACY_SYSTEM_API_FAILURE_COOLDOWN_MS: "20000"
    },
    async ({ lookupProductAvailability, getPharmacyLookupStatus }) => {
      let attempts = 0;
      global.fetch = async () => {
        attempts += 1;
        throw new Error("connect ECONNREFUSED");
      };

      const first = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });
      const second = await lookupProductAvailability({ query: "Mounjaro 5 mg KwikPen" });

      assert.equal(first.source, "document_fallback");
      assert.equal(second.source, "document_fallback");
      assert.equal(attempts, 1);
      assert.equal(getPharmacyLookupStatus().plexCircuitOpen, true);
    }
  );
});

test("si no hay api configurada informa fallback documental", async () => {
  await withLookupModule({}, async ({ getPharmacyLookupStatus }) => {
    assert.deepEqual(getPharmacyLookupStatus(), {
      ready: false,
      mode: "document_fallback",
      plexCenterConfigured: false,
      genericApiConfigured: false,
      branchIds: [],
      productsPerPage: null,
      failureCooldownMs: 20000,
      plexCircuitOpen: false,
      genericCircuitOpen: false,
      fallbackMode: "document"
    });
  });
});
