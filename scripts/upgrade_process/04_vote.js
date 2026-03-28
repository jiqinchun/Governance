const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "deployed.json");
const STATE_PATH = path.join(__dirname, "state.json");

const VOTING_DELAY = 60;

/**
 * 辅助函数：等待到指定区块时间
 * 在不支持 evm_increaseTime 的链上，用真实时间等待
 */
async function waitUntil(provider, signer, targetTimestamp, maxWaitSeconds = 300) {
  let latestBlock = await provider.getBlock("latest");
  let now = latestBlock.timestamp;

  if (targetTimestamp <= now) return;

  console.log(`   ⏳ 目标时间: ${new Date(targetTimestamp * 1000).toISOString()}`);

  const start = Date.now();
  while (now < targetTimestamp) {
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > maxWaitSeconds) {
      console.log(
        `   ⚠️ 已等待 ${Math.ceil(elapsed)} 秒仍未到达投票开始时间，请稍后重试。`
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
  const voter1 = new ethers.Wallet(
    "9f888cbab2e7f4f12686549fba9c4f02b4c7a08ba4cc3c42e23c680c3c578673",
    provider
  );
  const voter2 = new ethers.Wallet(
    "4bf042614763727e04b87367b405a247135ffe47179f665c46bb2849769c924e",
    provider
  );
  const voter3 = new ethers.Wallet(
    "36d967b08835247d851bf0b07428d6a47cf2ea7b2053b65450c4259145099e10",
    provider
  );
  const voter4 = new ethers.Wallet(
    "6f08641dc5dd53849fd3e2c07224f9f1e086dd926aa751687a1afa2a01a6e2a6",
    provider
  );
  const voter5 = new ethers.Wallet(
    "fc53bf98cf0a07884886cee6e4b56550dc367d124b88276db53138da93ec0bbd",
    provider
  );

  const paramRegistry = await ethers.getContractAt("ParameterRegistry", deployed.paramRegistry, deployer);

  const proposalId = state.proposalId;
  const proposalDetails = await paramRegistry.getProposalDetails(proposalId);
  console.log("Proposal details:", proposalDetails);

  console.log("Waiting for voting period...");
  console.log("Proposal start time:", new Date(Number(proposalDetails.startTime) * 1000).toISOString());
  const latestBlock = await provider.getBlock("latest");
  const now = latestBlock.timestamp;
  console.log("Current block time:", new Date(now * 1000).toISOString());
  // 获取提案状态
  console.log("Current proposal state:", await paramRegistry.getProposalState(proposalId));
  // 获取提案基础信息
  console.log("Proposal basic info:", await paramRegistry.getProposalBasic(proposalId));

  await advanceTimeOrWait(
    provider,
    deployer,
    VOTING_DELAY + 1,
    Number(proposalDetails.startTime)
  );

  const votes = [
    { voter: voter1, support: true, label: "投票者1" },
    { voter: voter2, support: true, label: "投票者2" },
    { voter: voter3, support: true, label: "投票者3" },
    { voter: voter4, support: true, label: "投票者4" },
    { voter: voter5, support: false, label: "投票者5" }
  ];

  for (const vote of votes) {
    const tx = await paramRegistry.connect(vote.voter).vote(proposalId, vote.support);
    await tx.wait();
    console.log(`- ${vote.label}: ${vote.support ? "赞成" : "反对"}`);
  }

  console.log("Voting done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Vote failed:", error);
    process.exit(1);
  });
