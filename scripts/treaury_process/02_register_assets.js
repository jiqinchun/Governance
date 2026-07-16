const { ethers, network } = require("hardhat");
const { randomInt } = require("crypto");
const {
  DEPLOYED_PATH,
  getAccounts,
  getAccountAddresses,
  loadDeployed,
  saveDeployed
} = require("./common");
const MIN_TREASURY_UNITS = 1000;
const MAX_TREASURY_UNITS = 10000;

const ASSET_DEFINITIONS = [
  { name: "Mock USD", symbol: "mUSD" },
  { name: "Mock Bitcoin", symbol: "mBTC" },
  { name: "Mock Ether", symbol: "mETH" },
  { name: "Mock Storage Credit", symbol: "mSC" },
  { name: "Mock Compute Credit", symbol: "mCC" },
  { name: "Mock Bandwidth Token", symbol: "mBW" },
  { name: "Mock Stable Reserve", symbol: "mSR" },
  { name: "Mock Reward Token", symbol: "mRWD" },
  { name: "Mock Governance Bond", symbol: "mBOND" },
  { name: "Mock Data Token", symbol: "mDATA" }
];

function randomTreasuryAmount() {
  return randomInt(MIN_TREASURY_UNITS, MAX_TREASURY_UNITS + 1);
}

async function main() {
  const deployed = loadDeployed();
  const accounts = await getAccounts();
  const deployer = accounts.deployer;
  const accountAddresses = await getAccountAddresses(accounts);
  const deployerAddress = accountAddresses.deployer;

  console.log("Registering treasury assets...");
  console.log("Network:", network.name);
  console.log("Deployer:", deployerAddress);
  console.log("Treasury:", deployed.treasury);

  const Treasury = await ethers.getContractFactory("Treasury", deployer);
  const treasury = Treasury.attach(deployed.treasury);
  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);

  const savedAssets = deployed.assets || [];
  const savedBySymbol = new Map(savedAssets.map((asset) => [asset.symbol, asset]));
  const registeredAssets = [];

  for (const definition of ASSET_DEFINITIONS) {
    let asset = savedBySymbol.get(definition.symbol);

    if (!asset?.address) {
      const token = await MockERC20.deploy(definition.name, definition.symbol);
      await token.waitForDeployment();

      asset = {
        name: definition.name,
        symbol: definition.symbol,
        address: await token.getAddress(),
        decimals: 18,
        initialTreasuryAmount: randomTreasuryAmount().toString()
      };

      console.log(`- ${definition.symbol}: deployed at ${asset.address}`);
    } else if (!asset.initialTreasuryAmount) {
      asset.initialTreasuryAmount = randomTreasuryAmount().toString();
      console.log(`- ${definition.symbol}: reused ${asset.address}`);
    } else {
      console.log(`- ${definition.symbol}: reused ${asset.address}`);
    }

    const token = MockERC20.attach(asset.address);
    const admitted = await treasury.isAssetAdmitted(asset.address);
    if (!admitted) {
      const admitTx = await treasury.admitAsset(asset.address, asset.symbol, asset.decimals);
      await admitTx.wait();
      console.log(`  admitted ${asset.symbol}`);
    } else {
      console.log(`  ${asset.symbol} already admitted`);
    }

    const targetBalance = ethers.parseUnits(asset.initialTreasuryAmount, asset.decimals);
    const currentBalance = await treasury.getAssetBalance(asset.address);

    if (currentBalance < targetBalance) {
      const depositAmount = targetBalance - currentBalance;
      const mintTx = await token.mint(deployerAddress, depositAmount);
      await mintTx.wait();

      const approveTx = await token.approve(deployed.treasury, depositAmount);
      await approveTx.wait();

      const depositTx = await treasury.deposit(
        asset.address,
        depositAmount,
        `Initial ${asset.symbol} treasury funding`
      );
      await depositTx.wait();

      console.log(`  deposited ${ethers.formatUnits(depositAmount, asset.decimals)} ${asset.symbol}`);
    } else {
      console.log(`  treasury balance already >= ${asset.initialTreasuryAmount} ${asset.symbol}`);
    }

    const finalBalance = await treasury.getAssetBalance(asset.address);
    registeredAssets.push({
      ...asset,
      treasuryBalance: ethers.formatUnits(finalBalance, asset.decimals)
    });
  }

  deployed.assets = registeredAssets;
  deployed.deployer = accountAddresses.deployer;
  deployed.assetManager = accountAddresses.assetManager;
  deployed.proposer = accountAddresses.proposer;
  deployed.voters = accountAddresses.voters;
  deployed.executor = accountAddresses.executor;
  deployed.updatedAt = new Date().toISOString();
  saveDeployed(deployed);

  console.log("Registered assets:", registeredAssets);
  console.log("Saved to:", DEPLOYED_PATH);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Register assets failed:", error);
    process.exit(1);
  });
