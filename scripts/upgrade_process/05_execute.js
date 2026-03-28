const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "deployed.json");
const STATE_PATH = path.join(__dirname, "state.json");

const VOTING_PERIOD = 120;

const ProposalState = {
  Pending: 0,
  Active: 1,
  Succeeded: 2,
  Defeated: 3,
  Executed: 4,
  Canceled: 5
};

/**
 * 辅助函数：等待到指定区块时间
 * 在不支持 evm_increaseTime 的链上，用真实时间等待
 */
async function waitUntil(provider, signer, targetTimestamp, maxWaitSeconds = 180) {
  let latestBlock = await provider.getBlock("latest");
  let now = latestBlock.timestamp;
  const diff = targetTimestamp - now;

  if (diff <= 0) return;

  if (diff > maxWaitSeconds) {
    console.log(
      `   ⚠️ 链不支持 evm_increaseTime，需要等待约 ${diff} 秒。请到达时间后重新运行脚本。`
    );
    process.exit(1);
  }

  console.log(`   ⏳ 目标时间: ${new Date(targetTimestamp * 1000).toISOString()}`);

  const start = Date.now();
  while (now < targetTimestamp) {
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > maxWaitSeconds) {
      console.log(
        `   ⚠️ 已等待 ${Math.ceil(elapsed)} 秒仍未到达执行时间，请稍后重试。`
      );
      process.exit(1);
    }

    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));

    const tx = await signer.sendTransaction({ to: signer.address, value: 0 });
    console.log("   ⛏️ 触发挖矿交易，尝试更新区块时间...");
    await tx.wait();

    latestBlock = await provider.getBlock("latest");
    now = latestBlock.timestamp;
  }
}

/**
 * 辅助函数：优先尝试快进时间，失败则等待到目标时间
 */
async function advanceTimeOrWait(provider, signer, seconds, targetTimestamp) {
  try {
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine");
    console.log(`   ⏰ 时间快进 ${seconds} 秒`);
  } catch {
    await waitUntil(provider, signer, targetTimestamp);
  }
}

async function main() {
  const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));

  const provider = ethers.provider;
  const deployer = new ethers.Wallet(
    "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
    provider
  );
  const executor = new ethers.Wallet(
    "d2cd72b2d16b4a0f7ea0689c9021a590638cb0bee6c39c4de52b5f363a0477a2",
    provider
  );

  const paramRegistry = await ethers.getContractAt("ParameterRegistry", deployed.paramRegistry, deployer);

  console.log("Waiting for voting to end...");
  const proposalId = state.proposalId;
  const proposalDetails = await paramRegistry.getProposalDetails(proposalId);
  await advanceTimeOrWait(
    provider,
    deployer,
    VOTING_PERIOD + 1,
    Number(proposalDetails.endTime)
  );
  const currentState = await paramRegistry.getProposalState(proposalId);

  if (Number(currentState) !== ProposalState.Succeeded) {
    console.log("Proposal not succeeded. State:", Number(currentState));
    return;
  }

  const tx = await paramRegistry.connect(executor).execute(proposalId);
  await tx.wait();
  console.log("Proposal executed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Execute failed:", error);
    process.exit(1);
  });
