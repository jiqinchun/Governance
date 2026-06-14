const { ethers } = require("hardhat");
const {
  ContractLevel,
  getAccounts,
  loadDeployed
} = require("./common");

async function main() {
  const deployed = loadDeployed();
  const accounts = await getAccounts();

  const govToken = await ethers.getContractAt("MockERC20", deployed.govToken, accounts.deployer);
  const upgradeGovernance = await ethers.getContractAt(
    "UpgradeGovernance",
    deployed.upgradeGovernance,
    accounts.registrar
  );

  const info = await upgradeGovernance.upgradeableContracts(deployed.proxy);
  if (info.isRegistered) {
    console.log("Proxy already registered:", deployed.proxy);
  } else {
    const tx = await upgradeGovernance.registerUpgradeableContract(
      deployed.proxy,
      "UpgradeableCounter",
      ContractLevel.SYSTEM,
      ethers.encodeBytes32String("execution"),
      deployed.oldImplementation
    );
    await tx.wait();
    console.log("Proxy registered:", deployed.proxy);
  }

  console.log("Minting governance tokens...");
  const roleAmount = ethers.parseEther("100");
  const roles = [
    "deployer",
    "registrar",
    "proposer",
    "voter1",
    "voter2",
    "voter3",
    "voter4",
    "voter5",
    "executor"
  ];

  const mintedByAddress = new Map();
  for (const role of roles) {
    const address = await accounts[role].getAddress();
    const normalized = address.toLowerCase();

    if (mintedByAddress.has(normalized)) {
      console.log(`- ${role}: ${address} already minted as ${mintedByAddress.get(normalized)}`);
      continue;
    }

    await (await govToken.mint(address, roleAmount)).wait();
    mintedByAddress.set(normalized, role);
    console.log(`- ${role}: minted ${ethers.formatEther(roleAmount)} GOV to ${address}`);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Register failed:", error);
    process.exit(1);
  });
