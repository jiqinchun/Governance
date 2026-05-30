const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "deployed.json");

const VOTING_DELAY = 60;
const VOTING_PERIOD = 120;

function generateParameterId(name, category) {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "bytes32"], [name, category])
  );
}

async function waitUntil(provider, signer, targetTimestamp, maxWaitSeconds = 600) {
  let latestBlock = await provider.getBlock("latest");
  let now = latestBlock.timestamp;

  if (targetTimestamp <= now) return;

  console.log(`   ⏳ 目标时间: ${new Date(targetTimestamp * 1000).toISOString()}`);

  const start = Date.now();
  while (now < targetTimestamp) {
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > maxWaitSeconds) {
      console.log(`   ⚠️ 已等待 ${Math.ceil(elapsed)} 秒仍未到达目标时间，请稍后重试。`);
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
  const provider = ethers.provider;

  const deployer = new ethers.Wallet(
    "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
    provider
  );
  const executor = new ethers.Wallet(
    "d2cd72b2d16b4a0f7ea0689c9021a590638cb0bee6c39c4de52b5f363a0477a2",
    provider
  );
  
  const voters = [
    new ethers.Wallet("9f888cbab2e7f4f12686549fba9c4f02b4c7a08ba4cc3c42e23c680c3c578673", provider),
    new ethers.Wallet("4bf042614763727e04b87367b405a247135ffe47179f665c46bb2849769c924e", provider),
    new ethers.Wallet("36d967b08835247d851bf0b07428d6a47cf2ea7b2053b65450c4259145099e10", provider),
    new ethers.Wallet("6f08641dc5dd53849fd3e2c07224f9f1e086dd926aa751687a1afa2a01a6e2a6", provider),
    new ethers.Wallet("fc53bf98cf0a07884886cee6e4b56550dc367d124b88276db53138da93ec0bbd", provider)
  ];

  const paramRegistry = await ethers.getContractAt("ParameterRegistry", deployed.paramRegistry, deployer);

  const CATEGORY_EXECUTION = ethers.encodeBytes32String("execution");
  const targetParamId = generateParameterId("minPowGas", CATEGORY_EXECUTION);

  console.log("1. Creating 10 proposals...");
  const proposalIds = [];
  let lastStartTime = 0;
  for (let i = 1; i <= 10; i++) {
    const newValue = 1000000 + i * 100;
    const encodedNewValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [newValue]);
    const tx = await paramRegistry.proposeParameterChange(
      targetParamId,
      encodedNewValue,
      `批量测试 execution minPowGas 提案 ${i}`
    );
    await tx.wait();
    
    // We get the newest global count mapping
    const pId = await paramRegistry.proposalCount();
    proposalIds.push(pId);
    console.log(`- Created proposal ID ${pId} with value ${newValue}`);
  }

  // Get start time of the LAST proposal to ensure we wait long enough
  const lastDetails = await paramRegistry.getProposalDetails(proposalIds[proposalIds.length - 1]);
  lastStartTime = Number(lastDetails.startTime);

  console.log("");
  console.log("2. Waiting for Voting Delay to pass...");
  await advanceTimeOrWait(provider, deployer, VOTING_DELAY + 1, lastStartTime);

  console.log("");
  console.log("3. Voting on all 10 proposals concurrently for multiple voters...");
  for (const pId of proposalIds) {
    console.log(`Sending votes for proposal ${pId}...`);
    const votePromises = [];
    for (let i = 0; i < 4; i++) { // 4 yea
      votePromises.push(paramRegistry.connect(voters[i]).vote(pId, true).then(tx => tx.wait()));
    }
    // 1 nay
    votePromises.push(paramRegistry.connect(voters[4]).vote(pId, false).then(tx => tx.wait()));
    
    // Wait for the votes of this proposal to land
    await Promise.all(votePromises);
  }

  const lastEndTime = Number(lastDetails.endTime);
  console.log("");
  console.log("4. Waiting for Voting Period to end...");
  // Use lastEndTime + 1
  await advanceTimeOrWait(provider, deployer, VOTING_PERIOD + 1, lastEndTime + 1);

  console.log("");
  console.log("5. Executing all 10 proposals concurrently...");
  const execPromises = [];
  for (const pId of proposalIds) {
    const state = await paramRegistry.getProposalState(pId);
    if (Number(state) === 2) { // 2 = Succeeded
      execPromises.push(
        paramRegistry.connect(executor).execute(pId).then(tx => tx.wait()).then(() => {
          console.log(`- Proposal ${pId} executed successfully.`);
        }).catch(err => {
          console.log(`- Proposal ${pId} failed during execution transaction: ${err.message}`);
        })
      );
    } else {
      console.log(`- Proposal ${pId} failed to execute, state is: ${state}`);
    }
  }
  
  if (execPromises.length > 0) {
    await Promise.all(execPromises);
  }

  console.log("All 10 proposals created, voted, and executed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
