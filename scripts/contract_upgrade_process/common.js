const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const BASE_DIR = __dirname;
const DEPLOYED_PATH = path.join(BASE_DIR, "deployed.json");
const STATE_PATH = path.join(BASE_DIR, "state.json");

const ContractLevel = {
  APPLICATION: 0,
  SYSTEM: 1,
  INFRASTRUCTURE: 2
};

const ProposalState = {
  Pending: 0,
  Active: 1,
  Succeeded: 2,
  Defeated: 3,
  Executed: 4,
  Canceled: 5
};

const VOTING_DELAY = 60;
const VOTING_PERIOD = 120;

async function getAccounts() {
  if (network.name === "hardhat" || network.name === "localhost") {
    const signers = await ethers.getSigners();
    return {
      deployer: signers[0],
      registrar: signers[1],
      proposer: signers[2],
      voter1: signers[3],
      voter2: signers[4],
      voter3: signers[5],
      voter4: signers[6],
      voter5: signers[7],
      executor: signers[8]
    };
  }

  const provider = ethers.provider;
  const key = (envName, fallbackEnvName = "PUNKCHAIN_PRIVATE_KEY") => {
    const privateKey = process.env[envName] || process.env[fallbackEnvName];
    if (!privateKey) {
      throw new Error(`Missing ${envName} or ${fallbackEnvName} for ${network.name}`);
    }
    return privateKey;
  };

  return {
    deployer: new ethers.Wallet(key("DEPLOYER_PRIVATE_KEY"), provider),
    registrar: new ethers.Wallet(key("REGISTRAR_PRIVATE_KEY"), provider),
    proposer: new ethers.Wallet(key("PROPOSER_PRIVATE_KEY"), provider),
    voter1: new ethers.Wallet(key("VOTER1_PRIVATE_KEY"), provider),
    voter2: new ethers.Wallet(key("VOTER2_PRIVATE_KEY"), provider),
    voter3: new ethers.Wallet(key("VOTER3_PRIVATE_KEY"), provider),
    voter4: new ethers.Wallet(key("VOTER4_PRIVATE_KEY"), provider),
    voter5: new ethers.Wallet(key("VOTER5_PRIVATE_KEY"), provider),
    executor: new ethers.Wallet(key("EXECUTOR_PRIVATE_KEY"), provider)
  };
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadDeployed() {
  return readJSON(DEPLOYED_PATH);
}

function saveDeployed(data) {
  writeJSON(DEPLOYED_PATH, data);
}

function loadState() {
  return readJSON(STATE_PATH);
}

function saveState(data) {
  writeJSON(STATE_PATH, data);
}

async function waitUntil(provider, signer, targetTimestamp, maxWaitSeconds = 300) {
  let latestBlock = await provider.getBlock("latest");
  let now = latestBlock.timestamp;

  if (targetTimestamp <= now) return;

  console.log(`Target block time: ${new Date(targetTimestamp * 1000).toISOString()}`);

  const start = Date.now();
  while (now < targetTimestamp) {
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > maxWaitSeconds) {
      throw new Error(`Timed out after ${Math.ceil(elapsed)} seconds waiting for target block time`);
    }

    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));

    const tx = await signer.sendTransaction({ to: await signer.getAddress(), value: 0 });
    await tx.wait();

    latestBlock = await provider.getBlock("latest");
    now = latestBlock.timestamp;
  }
}

async function advanceTimeOrWait(provider, signer, seconds, targetTimestamp) {
  try {
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine", []);
    console.log(`Advanced local time by ${seconds} seconds`);
  } catch {
    await waitUntil(provider, signer, targetTimestamp);
  }
}

module.exports = {
  DEPLOYED_PATH,
  STATE_PATH,
  ContractLevel,
  ProposalState,
  VOTING_DELAY,
  VOTING_PERIOD,
  getAccounts,
  loadDeployed,
  saveDeployed,
  loadState,
  saveState,
  advanceTimeOrWait
};
