const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const script = (name) => path.join(ROOT, "scripts", name);

const captureA = script("mock-rpc-9090.json");
const captureB = script("mock-rpc-9091.json");
const stateFile = script("offchain-executor-state.localtest.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function startMockServer(port, outputFile) {
  const env = {
    ...process.env,
    MOCK_RPC_PORT: String(port),
    MOCK_RPC_OUTPUT: outputFile
  };

  const child = spawn("node", [script("local-rpc-mock-server.js")], {
    cwd: ROOT,
    env,
    stdio: "inherit"
  });

  return child;
}

function runCommand(command, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`command failed (${code}): ${command}`));
    });
  });
}

async function main() {
  removeIfExists(captureA);
  removeIfExists(captureB);
  removeIfExists(stateFile);

  const mockA = startMockServer(9090, captureA);
  const mockB = startMockServer(9091, captureB);

  try {
    await sleep(1000);

    await runCommand("npx hardhat run .\\scripts\\offchain-parameter-executor.js --network punkchain", {
      RUN_ONCE: "1",
      DRY_RUN: "0",
      FROM_BLOCK_OVERRIDE: "0",
      EXECUTOR_STATE_PATH: stateFile,
      EXECUTION_RPC_URLS: "http://127.0.0.1:9090/rpc",
      STORAGE_RPC_URLS: "http://127.0.0.1:9091/rpc",
      EXECUTOR_RPC_METHOD: "governance.applyParameterUpdate"
    });

    await runCommand("node .\\scripts\\verify-offchain-rpc-delivery.js", {
      VERIFY_INPUT_FILES: "scripts/mock-rpc-9090.json,scripts/mock-rpc-9091.json"
    });

    console.log("[LOCAL_VERIFY_OK] offchain retrieval and rpc forwarding validated");
  } finally {
    mockA.kill();
    mockB.kill();
  }
}

main().catch((err) => {
    console.log(ROOT);
  console.error("[LOCAL_VERIFY_FAIL]", err.message || err);
  process.exit(1);
});
