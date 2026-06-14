const { ethers, network } = require("hardhat");
const { DEPLOYED_PATH, getAccounts, saveDeployed } = require("./common");

async function main() {
  const accounts = await getAccounts();
  const deployer = accounts.deployer;
  const deployerAddress = await deployer.getAddress();

  console.log("Deploying contract upgrade governance demo...");
  console.log("Network:", network.name);
  console.log("Deployer:", deployerAddress);

  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const govToken = await MockERC20.deploy("Governance Token", "GOV");
  await govToken.waitForDeployment();

  const UpgradeGovernance = await ethers.getContractFactory("UpgradeGovernance", deployer);
  const upgradeGovernance = await UpgradeGovernance.deploy(await govToken.getAddress());
  await upgradeGovernance.waitForDeployment();

  const CounterV1 = await ethers.getContractFactory("UpgradeableCounterV1", deployer);
  const counterV1 = await CounterV1.deploy();
  await counterV1.waitForDeployment();

  const initData = CounterV1.interface.encodeFunctionData("initialize", [
    await upgradeGovernance.getAddress(),
    7
  ]);

  const ERC1967Proxy = await ethers.getContractFactory("TestERC1967Proxy", deployer);
  const proxy = await ERC1967Proxy.deploy(await counterV1.getAddress(), initData);
  await proxy.waitForDeployment();

  const CounterV2 = await ethers.getContractFactory("UpgradeableCounterV2", deployer);
  const counterV2 = await CounterV2.deploy();
  await counterV2.waitForDeployment();

  const deployed = {
    network: network.name,
    govToken: await govToken.getAddress(),
    upgradeGovernance: await upgradeGovernance.getAddress(),
    proxy: await proxy.getAddress(),
    oldImplementation: await counterV1.getAddress(),
    newImplementation: await counterV2.getAddress(),
    proxyInitialValue: 7,
    deployer: deployerAddress,
    registrar: await accounts.registrar.getAddress(),
    proposer: await accounts.proposer.getAddress(),
    voters: [
      await accounts.voter1.getAddress(),
      await accounts.voter2.getAddress(),
      await accounts.voter3.getAddress(),
      await accounts.voter4.getAddress(),
      await accounts.voter5.getAddress()
    ]
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
