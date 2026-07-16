const { ethers, network } = require("hardhat");
const {
  ProposalState,
  VOTING_PERIOD,
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
  const proposalId = state.proposalId;
  const proposalDetails = await treasury.getProposalDetails(proposalId);
  const proposalBasic = await treasury.getProposalBasic(proposalId);

  const tokenAddress = proposalBasic.token ?? proposalBasic[2];
  const target = proposalBasic.target ?? proposalBasic[3];
  const amount = proposalDetails.amount ?? proposalDetails[0];
  const assetDecimals = state.asset?.decimals ?? 18;

  console.log("Executing treasury proposal...");
  console.log("Network:", network.name);
  console.log("Proposal ID:", proposalId);
  console.log("Token:", tokenAddress);
  console.log("Target:", target);
  console.log("Amount:", amount.toString());

  console.log("Waiting for voting to end...");
  await advanceTimeOrWait(
    ethers.provider,
    accounts.deployer,
    VOTING_PERIOD + 1,
    Number(proposalDetails.endTime ?? proposalDetails[2]) + 1
  );

  const currentState = await treasury.getProposalState(proposalId);
  console.log("Current proposal state:", Number(currentState));

  if (Number(currentState) === ProposalState.Executed) {
    console.log("Proposal already executed. Skip execution.");
    return;
  }

  if (Number(currentState) !== ProposalState.Succeeded) {
    console.log("Proposal not succeeded. Skip execution.");
    return;
  }

  const token = await ethers.getContractAt("MockERC20", tokenAddress, accounts.deployer);
  const targetBalanceBefore = await token.balanceOf(target);
  const treasuryBalanceBefore = await treasury.getAssetBalance(tokenAddress);

  const tx = await treasury.connect(accounts.executor).execute(proposalId);
  await tx.wait();

  const targetBalanceAfter = await token.balanceOf(target);
  const treasuryBalanceAfter = await treasury.getAssetBalance(tokenAddress);
  const updatedStateValue = await treasury.getProposalState(proposalId);

  const updatedState = {
    ...state,
    executed: true,
    executedAt: formatDateTime(),
    proposalState: Number(updatedStateValue),
    targetBalanceBefore: formatTokenAmount(targetBalanceBefore, assetDecimals),
    targetBalanceAfter: formatTokenAmount(targetBalanceAfter, assetDecimals),
    treasuryBalanceBefore: formatTokenAmount(treasuryBalanceBefore, assetDecimals),
    treasuryBalanceAfter: formatTokenAmount(treasuryBalanceAfter, assetDecimals),
    executedAmount: formatTokenAmount(amount, assetDecimals)
  };
  saveState(updatedState);

  console.log("Treasury proposal executed.");
  console.log("Proposal state:", Number(updatedStateValue));
  console.log("Target balance before:", targetBalanceBefore.toString());
  console.log("Target balance after:", targetBalanceAfter.toString());
  console.log("Treasury balance before:", treasuryBalanceBefore.toString());
  console.log("Treasury balance after:", treasuryBalanceAfter.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Execute failed:", error);
    process.exit(1);
  });
