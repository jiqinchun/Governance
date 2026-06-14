const { execSync, spawn } = require("child_process");

const SCRIPTS = [
  "scripts/contract_upgrade_process/01_deploy.js",
  "scripts/contract_upgrade_process/02_register_proxy.js",
  "scripts/contract_upgrade_process/03_propose_upgrade.js",
  "scripts/contract_upgrade_process/04_vote.js",
  "scripts/contract_upgrade_process/05_execute.js"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startHardhatNode() {
  return spawn("npx", ["hardhat", "node", "--hostname", "127.0.0.1"], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`command failed (${code}): ${command}`));
      }
    });
  });
}

function killProcessTree(child) {
  if (!child || !child.pid) return;

  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
      return;
    } catch {
      // Fall through to child.kill for best-effort cleanup.
    }
  }

  child.kill();
}

async function main() {
  const node = startHardhatNode();
  let nodeOutput = "";

  node.stdout.on("data", (chunk) => {
    nodeOutput += chunk.toString();
  });
  node.stderr.on("data", (chunk) => {
    nodeOutput += chunk.toString();
  });

  try {
    await sleep(2500);

    if (node.exitCode !== null) {
      throw new Error(`hardhat node exited early:\n${nodeOutput}`);
    }

    for (const script of SCRIPTS) {
      console.log(`\n========== Running ${script} ==========`);
      await runCommand(`npx hardhat run ${script} --network localhost`);
    }

    console.log("\n[LOCAL_CONTRACT_UPGRADE_FLOW_OK]");
  } finally {
    killProcessTree(node);
  }
}

main().catch((error) => {
  console.error("[LOCAL_CONTRACT_UPGRADE_FLOW_FAIL]", error.message || error);
  process.exit(1);
});
