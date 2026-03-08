function toMapById(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id || "").trim();
    if (!id) {
      continue;
    }
    map.set(id, item);
  }
  return map;
}

function createFlowEngine(workflow) {
  const safeWorkflow = workflow && typeof workflow === "object" ? workflow : { nodes: [], edges: [] };
  const nodesById = toMapById(safeWorkflow.nodes);
  const activeEdges = [];
  const routeToNode = new Map();
  const outgoingByNode = new Map();

  for (const edge of Array.isArray(safeWorkflow.edges) ? safeWorkflow.edges : []) {
    if (!edge || edge.disabled) {
      continue;
    }
    const from = String(edge.from || "").trim();
    const to = String(edge.to || "").trim();
    if (!from || !to) {
      continue;
    }
    const normalized = { ...edge, from, to };
    activeEdges.push(normalized);
    if (!outgoingByNode.has(from)) {
      outgoingByNode.set(from, []);
    }
    outgoingByNode.get(from).push(normalized);
    const routeKey = String(edge.routeKey || "").trim();
    if (routeKey) {
      routeToNode.set(routeKey, to);
    }
  }

  function hasNode(nodeId) {
    return nodesById.has(String(nodeId || "").trim());
  }

  function getNode(nodeId) {
    return nodesById.get(String(nodeId || "").trim()) || null;
  }

  function resolveNode(preferredNodeId, fallbackNodeId) {
    if (hasNode(preferredNodeId)) {
      return String(preferredNodeId);
    }
    if (hasNode(fallbackNodeId)) {
      return String(fallbackNodeId);
    }
    return String(preferredNodeId || fallbackNodeId || "").trim() || null;
  }

  function resolveRoute(fromNodeId, routeKey, fallbackNodeId) {
    const key = String(routeKey || "").trim();
    if (key) {
      const routed = routeToNode.get(key);
      if (hasNode(routed)) {
        return routed;
      }
    }

    if (hasNode(fallbackNodeId)) {
      return String(fallbackNodeId);
    }

    const outgoing = outgoingByNode.get(String(fromNodeId || "").trim()) || [];
    for (const edge of outgoing) {
      if (hasNode(edge.to)) {
        return edge.to;
      }
    }

    return String(fallbackNodeId || fromNodeId || "").trim() || null;
  }

  function executeNode({ nodeId, handlers, context }) {
    const effectiveNodeId = resolveNode(nodeId, null);
    const handler = handlers?.[effectiveNodeId] || handlers?.__default;
    if (typeof handler !== "function") {
      return { actions: [] };
    }

    const result = handler({
      ...(context || {}),
      nodeId: effectiveNodeId,
      node: getNode(effectiveNodeId),
      flow: api
    });

    if (!result || typeof result !== "object") {
      return { actions: [] };
    }

    return {
      actions: Array.isArray(result.actions) ? result.actions : [],
      meta: result.meta || null
    };
  }

  const api = {
    workflowId: String(safeWorkflow.id || ""),
    nodesById,
    activeEdges,
    hasNode,
    getNode,
    resolveNode,
    resolveRoute,
    executeNode
  };

  return api;
}

module.exports = {
  createFlowEngine
};

