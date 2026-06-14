const { ethers } = require("hardhat");
const {
  ProposalState,
  VOTING_PERIOD,
  advanceTimeOrWait,
  getAccounts,
  loadDeployed,
  loadState
} = require("./common");

async function main() {
  const deployed = loadDeployed();
  const state = loadState();
  const accounts = await getAccounts();

  const upgradeGovernance = await ethers.getContractAt(
    "UpgradeGovernance",
    deployed.upgradeGovernance,
    accounts.deployer
  );
  const counterBefore = await ethers.getContractAt("UpgradeableCounterV1", deployed.proxy, accounts.deployer);

  const proposalId = state.proposalId;
  const proposalDetails = await upgradeGovernance.getProposalDetails(proposalId);

  console.log("Waiting for voting to end...");
  await advanceTimeOrWait(
    ethers.provider,
    accounts.deployer,
    VOTING_PERIOD + 1,
    Number(proposalDetails.endTime) + 1
  );

  const currentState = await upgradeGovernance.getProposalState(proposalId);
  console.log("Current proposal state:", Number(currentState));

  if (Number(currentState) !== ProposalState.Succeeded) {
    console.log("Proposal not succeeded. Skip execution.");
    return;
  }

  console.log("Proxy version before:", await counterBefore.version());
  console.log("Proxy value before:", (await counterBefore.value()).toString());

  const tx = await upgradeGovernance.connect(accounts.executor).executeUpgrade(proposalId);
  await tx.wait();

  const counterAfter = await ethers.getContractAt("UpgradeableCounterV2", deployed.proxy, accounts.deployer);
  const updatedState = await upgradeGovernance.getProposalState(proposalId);
  const info = await upgradeGovernance.getUpgradeableContract(deployed.proxy);

  console.log("Upgrade proposal executed.");
  console.log("Proposal state:", Number(updatedState));
  console.log("Proxy version after:", await counterAfter.version());
  console.log("Proxy value after:", (await counterAfter.value()).toString());
  console.log("Proxy multiplier after:", (await counterAfter.multiplier()).toString());
  console.log("Governance recorded implementation:", info.currentImplementation);

  const incrementTx = await counterAfter.increment();
  await incrementTx.wait();
  console.log("Proxy value after V2 increment:", (await counterAfter.value()).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Execute failed:", error);
    process.exit(1);
  });
