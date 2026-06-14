const { ethers } = require("hardhat");
const {
  STATE_PATH,
  getAccounts,
  loadDeployed,
  saveDeployed,
  saveState
} = require("./common");

async function main() {
  const deployed = loadDeployed();
  const accounts = await getAccounts();

  const upgradeGovernance = await ethers.getContractAt(
    "UpgradeGovernance",
    deployed.upgradeGovernance,
    accounts.proposer
  );

  const migrationValue = Number(process.env.MIGRATION_VALUE || 3);
  const CounterV2 = await ethers.getContractFactory("UpgradeableCounterV2", accounts.proposer);
  const registered = await upgradeGovernance.getUpgradeableContract(deployed.proxy);
  const currentImplementation = registered.currentImplementation;
  let targetImplementation = deployed.newImplementation;
  let callData = CounterV2.interface.encodeFunctionData("initializeV2", [migrationValue]);
  let description = `Upgrade counter proxy to V2 and set multiplier to ${migrationValue}`;

  if (currentImplementation.toLowerCase() === targetImplementation.toLowerCase()) {
    const nextImplementation = await CounterV2.deploy();
    await nextImplementation.waitForDeployment();

    targetImplementation = await nextImplementation.getAddress();
    callData = "0x";
    description = `Upgrade counter proxy to another V2 implementation ${targetImplementation}`;

    deployed.oldImplementation = currentImplementation;
    deployed.newImplementation = targetImplementation;
    saveDeployed(deployed);

    console.log("Current implementation already matches deployed.newImplementation.");
    console.log("Deployed a fresh V2 implementation for the next proposal:", targetImplementation);
  }

  const tx = await upgradeGovernance.proposeUpgrade(
    deployed.proxy,
    targetImplementation,
    callData,
    description
  );
  await tx.wait();

  const proposalId = await upgradeGovernance.proposalCount();
  const state = {
    proposalId: proposalId.toString(),
    proxy: deployed.proxy,
    oldImplementation: currentImplementation,
    newImplementation: targetImplementation,
    callData,
    migrationValue
  };

  saveState(state);

  console.log("Upgrade proposal created:", state);
  console.log("Saved to:", STATE_PATH);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Propose failed:", error);
    process.exit(1);
  });
