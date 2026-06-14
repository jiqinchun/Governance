const { ethers } = require("hardhat");
const {
  VOTING_DELAY,
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

  const proposalId = state.proposalId;
  const proposalDetails = await upgradeGovernance.getProposalDetails(proposalId);

  console.log("Proposal details:", proposalDetails);
  console.log("Waiting for voting period...");
  console.log("Proposal start time:", new Date(Number(proposalDetails.startTime) * 1000).toISOString());

  await advanceTimeOrWait(
    ethers.provider,
    accounts.deployer,
    VOTING_DELAY + 1,
    Number(proposalDetails.startTime)
  );

  const votes = [
    { voter: accounts.voter1, support: true, label: "voter1" },
    { voter: accounts.voter2, support: true, label: "voter2" },
    { voter: accounts.voter3, support: true, label: "voter3" },
    { voter: accounts.voter4, support: true, label: "voter4" },
    { voter: accounts.voter5, support: false, label: "voter5" }
  ];

  for (const vote of votes) {
    const tx = await upgradeGovernance.connect(vote.voter).vote(proposalId, vote.support);
    await tx.wait();
    console.log(`- ${vote.label}: ${vote.support ? "for" : "against"}`);
  }

  const results = await upgradeGovernance.getVotingResults(proposalId);
  console.log("Voting results:", {
    forVotes: ethers.formatEther(results.forVotes),
    againstVotes: ethers.formatEther(results.againstVotes),
    totalVotes: ethers.formatEther(results.totalVotes),
    forPercentage: `${Number(results.forPercentage) / 100}%`,
    requiredThreshold: `${Number(results.requiredThreshold) / 100}%`,
    isPassing: results.isPassing
  });

  console.log("Voting done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Vote failed:", error);
    process.exit(1);
  });
