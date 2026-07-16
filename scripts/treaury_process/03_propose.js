const { ethers, network } = require("hardhat");
const {
  STATE_PATH,
  formatTimestamp,
  formatTokenAmount,
  getAccounts,
  getAccountAddresses,
  loadDeployed,
  saveState
} = require("./common");

const DEFAULT_PROPOSAL_AMOUNT = "250";
const MIN_GOV_BALANCE = ethers.parseEther("100");

function pickAsset(deployed) {
  if (!deployed.assets?.length) {
    throw new Error("No registered treasury assets found. Run 02_register_assets.js first.");
  }

  const symbol = process.env.ASSET_SYMBOL;
  if (!symbol) return deployed.assets[0];

  const asset = deployed.assets.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());
  if (!asset) {
    throw new Error(`Asset ${symbol} not found in deployed.assets`);
  }
  return asset;
}

async function ensureGovernanceBalance(govToken, address, label) {
  const current = await govToken.balanceOf(address);
  if (current >= MIN_GOV_BALANCE) {
    console.log(`- ${label}: ${ethers.formatEther(current)} GOV`);
    return;
  }

  const mintAmount = MIN_GOV_BALANCE - current;
  await (await govToken.mint(address, mintAmount)).wait();
  console.log(`- ${label}: minted ${ethers.formatEther(mintAmount)} GOV`);
}

async function main() {
  const deployed = loadDeployed();
  const accounts = await getAccounts();
  const accountAddresses = await getAccountAddresses(accounts);

  const asset = pickAsset(deployed);
  const target = process.env.TARGET_ADDRESS || accountAddresses.assetManager;
  const amountInput = process.env.PROPOSAL_AMOUNT || DEFAULT_PROPOSAL_AMOUNT;
  const amount = ethers.parseUnits(amountInput, asset.decimals);
  const description = process.env.PROPOSAL_DESCRIPTION ||
    `Treasury proposal to transfer ${amountInput} ${asset.symbol} to ${target}`;

  console.log("Creating treasury proposal...");
  console.log("Network:", network.name);
  console.log("Treasury:", deployed.treasury);
  console.log("Proposer:", accountAddresses.proposer);
  console.log("Asset:", `${asset.symbol} (${asset.address})`);
  console.log("Target:", target);
  console.log("Amount:", `${amountInput} ${asset.symbol}`);

  if (!ethers.isAddress(target)) {
    throw new Error(`Invalid target address: ${target}`);
  }

  const govToken = await ethers.getContractAt("MockERC20", deployed.govToken, accounts.deployer);
  const treasury = await ethers.getContractAt("Treasury", deployed.treasury, accounts.proposer);

  console.log("Ensuring governance token balances...");
  const roles = [
    ["deployer", accountAddresses.deployer],
    ["assetManager", accountAddresses.assetManager],
    ["proposer", accountAddresses.proposer],
    ["voter1", accountAddresses.voters[0]],
    ["voter2", accountAddresses.voters[1]],
    ["voter3", accountAddresses.voters[2]],
    ["voter4", accountAddresses.voters[3]],
    ["voter5", accountAddresses.voters[4]],
    ["executor", accountAddresses.executor]
  ];

  const checked = new Map();
  for (const [label, address] of roles) {
    const normalized = address.toLowerCase();
    if (checked.has(normalized)) {
      console.log(`- ${label}: same address as ${checked.get(normalized)}`);
      continue;
    }
    await ensureGovernanceBalance(govToken, address, label);
    checked.set(normalized, label);
  }

  const admitted = await treasury.isAssetAdmitted(asset.address);
  if (!admitted) {
    throw new Error(`${asset.symbol} is not admitted by treasury`);
  }

  const treasuryBalance = await treasury.getAssetBalance(asset.address);
  if (treasuryBalance < amount) {
    throw new Error(
      `Insufficient treasury balance for ${asset.symbol}. ` +
      `Need ${amountInput}, current ${ethers.formatUnits(treasuryBalance, asset.decimals)}`
    );
  }

  const tx = await treasury.propose(asset.address, target, amount, description);
  await tx.wait();

  const proposalId = await treasury.proposalCount();
  const basic = await treasury.getProposalBasic(proposalId);
  const details = await treasury.getProposalDetails(proposalId);

  const state = {
    proposalId: proposalId.toString(),
    proposer: basic.proposer || basic[1],
    token: basic.token || basic[2],
    asset: {
      name: asset.name,
      symbol: asset.symbol,
      decimals: asset.decimals
    },
    target: basic.target || basic[3],
    amount: formatTokenAmount(amount, asset.decimals),
    description: basic.description || basic[4],
    startTime: formatTimestamp(details.startTime ?? details[1]),
    endTime: formatTimestamp(details.endTime ?? details[2])
  };

  saveState(state);

  console.log("Treasury proposal created:", state);
  console.log("Saved to:", STATE_PATH);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Propose failed:", error);
    process.exit(1);
  });
