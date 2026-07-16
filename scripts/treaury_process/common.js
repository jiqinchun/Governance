const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const BASE_DIR = __dirname;
const DEPLOYED_PATH = path.join(BASE_DIR, "deployed.json");
const STATE_PATH = path.join(BASE_DIR, "state.json");

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

const DEFAULT_PRIVATE_KEYS = {
  deployer: "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
  voter1: "9f888cbab2e7f4f12686549fba9c4f02b4c7a08ba4cc3c42e23c680c3c578673",
  voter2: "4bf042614763727e04b87367b405a247135ffe47179f665c46bb2849769c924e",
  voter3: "36d967b08835247d851bf0b07428d6a47cf2ea7b2053b65450c4259145099e10",
  voter4: "6f08641dc5dd53849fd3e2c07224f9f1e086dd926aa751687a1afa2a01a6e2a6",
  voter5: "fc53bf98cf0a07884886cee6e4b56550dc367d124b88276db53138da93ec0bbd"
};

async function getAccounts() {
  if (network.name === "hardhat" || network.name === "localhost") {
    const signers = await ethers.getSigners();
    return {
      deployer: signers[0],
      assetManager: signers[1],
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
  const key = (envName, fallback) => process.env[envName] || fallback;

  return {
    deployer: new ethers.Wallet(key("DEPLOYER_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.deployer), provider),
    assetManager: new ethers.Wallet(key("ASSET_MANAGER_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.deployer), provider),
    proposer: new ethers.Wallet(key("PROPOSER_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.deployer), provider),
    voter1: new ethers.Wallet(key("VOTER1_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.voter1), provider),
    voter2: new ethers.Wallet(key("VOTER2_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.voter2), provider),
    voter3: new ethers.Wallet(key("VOTER3_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.voter3), provider),
    voter4: new ethers.Wallet(key("VOTER4_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.voter4), provider),
    voter5: new ethers.Wallet(key("VOTER5_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.voter5), provider),
    executor: new ethers.Wallet(key("EXECUTOR_PRIVATE_KEY", DEFAULT_PRIVATE_KEYS.deployer), provider)
  };
}

async function getAccountAddresses(accounts) {
  return {
    deployer: await accounts.deployer.getAddress(),
    assetManager: await accounts.assetManager.getAddress(),
    proposer: await accounts.proposer.getAddress(),
    voters: [
      await accounts.voter1.getAddress(),
      await accounts.voter2.getAddress(),
      await accounts.voter3.getAddress(),
      await accounts.voter4.getAddress(),
      await accounts.voter5.getAddress()
    ],
    executor: await accounts.executor.getAddress()
  };
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function trimFormattedAmount(value) {
  return value
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function formatTokenAmount(value, decimals = 18) {
  return trimFormattedAmount(ethers.formatUnits(value, decimals));
}

function formatTimestamp(timestamp) {
  const seconds = Number(timestamp);
  const shanghaiDate = new Date((seconds + 8 * 60 * 60) * 1000);
  return `${shanghaiDate.toISOString().replace("T", " ").slice(0, 19)} Asia/Shanghai`;
}

function formatDateTime(date = new Date()) {
  const shanghaiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${shanghaiDate.toISOString().replace("T", " ").slice(0, 19)} Asia/Shanghai`;
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

    const signerAddress = await signer.getAddress();
    const tx = await signer.sendTransaction({ to: signerAddress, value: 0 });
    console.log("Sent a zero-value transaction to advance block time.");
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
  ProposalState,
  VOTING_DELAY,
  VOTING_PERIOD,
  getAccounts,
  getAccountAddresses,
  formatDateTime,
  formatTimestamp,
  formatTokenAmount,
  loadDeployed,
  saveDeployed,
  loadState,
  saveState,
  advanceTimeOrWait
};
