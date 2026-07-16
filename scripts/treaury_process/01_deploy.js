const { ethers, network } = require("hardhat");
const { DEPLOYED_PATH, getAccounts, getAccountAddresses, saveDeployed } = require("./common");

async function main() {
  const accounts = await getAccounts();
  const deployer = accounts.deployer;
  const accountAddresses = await getAccountAddresses(accounts);

  console.log("Deploying treasury governance...");
  console.log("Network:", network.name);
  console.log("Deployer:", accountAddresses.deployer);

  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const govToken = await MockERC20.deploy("Governance Token", "GOV");
  await govToken.waitForDeployment();

  const Treasury = await ethers.getContractFactory("Treasury", deployer);
  const treasury = await Treasury.deploy(await govToken.getAddress());
  await treasury.waitForDeployment();

  const nativeToken = await treasury.NATIVE_TOKEN();
  const nativeStats = await treasury.getAssetStats(nativeToken);

  const deployed = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    govToken: await govToken.getAddress(),
    treasury: await treasury.getAddress(),
    nativeToken,
    nativeAsset: {
      symbol: nativeStats.symbol || nativeStats[1],
      decimals: Number(nativeStats.decimals ?? nativeStats[2])
    },
    deployer: accountAddresses.deployer,
    admin: await treasury.admin(),
    assetManager: accountAddresses.assetManager,
    proposer: accountAddresses.proposer,
    voters: accountAddresses.voters,
    executor: accountAddresses.executor,
    timestamp: new Date().toISOString()
  };

  saveDeployed(deployed);

  console.log("Deployed:", deployed);
  console.log("Saved to:", DEPLOYED_PATH);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deploy failed:", error);
    process.exit(1);
  });
