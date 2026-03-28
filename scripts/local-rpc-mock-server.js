const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.MOCK_RPC_PORT || 9090);
const OUTPUT_FILE = process.env.MOCK_RPC_OUTPUT || path.join(__dirname, `mock-rpc-${PORT}.json`);

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function appendRecord(record) {
  ensureParentDir(OUTPUT_FILE);
  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }
  existing.push(record);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/rpc") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });

  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }

    const record = {
      receivedAt: new Date().toISOString(),
      method: body.method,
      params: body.params,
      id: body.id
    };
    appendRecord(record);

    const response = {
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: {
        ok: true,
        serverPort: PORT,
        acceptedAt: record.receivedAt
      }
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[MOCK_RPC] listening on http://127.0.0.1:${PORT}/rpc`);
  console.log(`[MOCK_RPC] writing captured requests to ${OUTPUT_FILE}`);
});
