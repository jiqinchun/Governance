const fs = require("fs");
const path = require("path");

const INPUT_FILES = (process.env.VERIFY_INPUT_FILES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`expected JSON array in file: ${filePath}`);
  }
  return parsed;
}

function validateRecord(record, filePath, idx) {
  if (!record || typeof record !== "object") {
    throw new Error(`invalid record at ${filePath}[${idx}]`);
  }

  if (record.method !== "governance.applyParameterUpdate") {
    throw new Error(`unexpected rpc method at ${filePath}[${idx}]: ${record.method}`);
  }

  const p = record.params;
  if (!p || typeof p !== "object") {
    throw new Error(`missing params at ${filePath}[${idx}]`);
  }

  const requiredFields = [
    "proposalId",
    "parameterId",
    "parameterName",
    "zone",
    "newValue",
    "chainId",
    "blockNumber",
    "txHash"
  ];

  for (const f of requiredFields) {
    if (!(f in p)) {
      throw new Error(`missing params.${f} at ${filePath}[${idx}]`);
    }
  }
}

function main() {
  if (INPUT_FILES.length === 0) {
    throw new Error("set VERIFY_INPUT_FILES env, e.g. scripts/mock-rpc-9090.json,scripts/mock-rpc-9091.json");
  }

  let total = 0;
  const summary = [];

  for (const relPath of INPUT_FILES) {
    const fullPath = path.isAbsolute(relPath)
      ? relPath
      : path.join(process.cwd(), relPath);

    const data = readJsonArray(fullPath);
    if (data.length === 0) {
      throw new Error(`no rpc calls captured in ${fullPath}`);
    }

    data.forEach((r, i) => validateRecord(r, fullPath, i));
    total += data.length;

    summary.push({
      file: fullPath,
      count: data.length,
      latestProposalId: String(data[data.length - 1].params.proposalId),
      latestParameter: data[data.length - 1].params.parameterName
    });
  }

  console.log("[VERIFY_OK] delivery validated");
  console.log(JSON.stringify({ totalCalls: total, perFile: summary }, null, 2));
}

try {
  main();
} catch (err) {
  console.error("[VERIFY_FAIL]", err.message || err);
  process.exit(1);
}
