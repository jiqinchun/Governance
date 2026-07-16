const { ethers, network } = require("hardhat");
const {
  VOTING_DELAY,
  advanceTimeOrWait,
  formatDateTime,
  formatTokenAmount,
  getAccounts,
  loadDeployed,
  loadState,
  saveState
} = require("./common");

async function main() {
  const deployed = loadDeployed();
  const state = loadState();
  const accounts = await getAccounts();

  const treasury = await ethers.getContractAt("Treasury", deployed.treasury, accounts.deployer);
  const govToken = await ethers.getContractAt("MockERC20", deployed.govToken, accounts.deployer);

  const proposalId = state.proposalId;
  const proposalDetails = await treasury.getProposalDetails(proposalId);
  const proposalBasic = await treasury.getProposalBasic(proposalId);

  console.log("Voting on treasury proposal...");
  console.log("Network:", network.name);
  console.log("Proposal ID:", proposalId);
  console.log("Proposal state:", Number(proposalBasic.state ?? proposalBasic[5]));
  console.log("Proposal start time:", new Date(Number(proposalDetails.startTime ?? proposalDetails[1]) * 1000).toISOString());

  await advanceTimeOrWait(
    ethers.provider,
    accounts.deployer,
    VOTING_DELAY + 1,
    Number(proposalDetails.startTime ?? proposalDetails[1])
  );

  const activeState = await treasury.getProposalState(proposalId);
  if (Number(activeState) !== 1) {
    throw new Error(`Proposal is not active after waiting. Current state: ${Number(activeState)}`);
  }

  const votes = [
    { voter: accounts.voter1, support: true, label: "voter1" },
    { voter: accounts.voter2, support: true, label: "voter2" },
    { voter: accounts.voter3, support: true, label: "voter3" },
    { voter: accounts.voter4, support: true, label: "voter4" },
    { voter: accounts.voter5, support: false, label: "voter5" }
  ];

  const voteResults = [];
  for (const vote of votes) {
    const voterAddress = await vote.voter.getAddress();
    const alreadyVoted = await treasury.hasVoted(proposalId, voterAddress);
    const weight = await govToken.balanceOf(voterAddress);

    if (alreadyVoted) {
      console.log(`- ${vote.label}: already voted (${ethers.formatEther(weight)} GOV)`);
      voteResults.push({
        voter: voterAddress,
        support: vote.support,
        weight: formatTokenAmount(weight),
        skipped: true
      });
      continue;
    }

    const tx = await treasury.connect(vote.voter).vote(proposalId, vote.support);
    await tx.wait();

    console.log(`- ${vote.label}: ${vote.support ? "for" : "against"} (${ethers.formatEther(weight)} GOV)`);
    voteResults.push({
      voter: voterAddress,
      support: vote.support,
      weight: formatTokenAmount(weight),
      skipped: false
    });
  }

  const updatedDetails = await treasury.getProposalDetails(proposalId);
  const forVotes = updatedDetails.forVotes ?? updatedDetails[3];
  const againstVotes = updatedDetails.againstVotes ?? updatedDetails[4];
  const totalVotes = forVotes + againstVotes;

  const updatedState = {
    ...state,
    votes: voteResults,
    forVotes: formatTokenAmount(forVotes),
    againstVotes: formatTokenAmount(againstVotes),
    totalVotes: formatTokenAmount(totalVotes),
    votedAt: formatDateTime()
  };
  saveState(updatedState);

  console.log("Voting results:", {
    forVotes: ethers.formatEther(forVotes),
    againstVotes: ethers.formatEther(againstVotes),
    totalVotes: ethers.formatEther(totalVotes)
  });
  console.log("Voting done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Vote failed:", error);
    process.exit(1);
  });
