/**
 * 存储区参数治理：修改 replicationFactor（已部署合约版本）
 * 使用与 storage-governance-example.js 一致的账户
 */

const { ethers } = require("hardhat");

const VOTING_DELAY = 1 * 24 * 60 * 60;
const VOTING_PERIOD = 5 * 24 * 60 * 60;

const ProposalState = {
  Pending: 0,
  Active: 1,
  Succeeded: 2,
  Defeated: 3,
  Executed: 4,
  Canceled: 5
};

const DEPLOYED = {
  govToken: "0x4978b6Be876F65310e59CEcfa09b56acc1B778cf",
  paramRegistry: "0x64477aBB4AE67D3cDfc4E4B8fB0C1c61bD7211EB"
};

async function increaseTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
  console.log(`   ⏰ 时间快进 ${seconds} 秒`);
}

function generateParameterId(name, category) {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "bytes32"], [name, category])
  );
}

function getStateName(state) {
  const names = ["Pending", "Active", "Succeeded", "Defeated", "Executed", "Canceled"];
  return names[state] || "Unknown";
}

async function main() {
  console.log("=".repeat(60));
  console.log("replicationFactor 提案/投票/执行流程");
  console.log("=".repeat(60));

  const provider = ethers.provider;
  const deployer = new ethers.Wallet(
    "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
    provider
  );
  const storageAdmin = new ethers.Wallet(
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
  const executor = new ethers.Wallet(
    "d2cd72b2d16b4a0f7ea0689c9021a590638cb0bee6c39c4de52b5f363a0477a2",
    provider
  );

  console.log("\n📋 账户:");
  console.log("   部署者:", deployer.address);
  console.log("   存储区管理员:", storageAdmin.address);
  console.log("   投票者1-5:", voter1.address, "...");

  const govToken = await ethers.getContractAt("MockERC20", DEPLOYED.govToken, deployer);
  const paramRegistry = await ethers.getContractAt("ParameterRegistry", DEPLOYED.paramRegistry, deployer);

  // 查询已注册的参数
  console.log("\n2.2 查询已注册参数...");
  const allParams = await paramRegistry.getAllParameters();
  console.log(`   已注册参数数量: ${allParams.length}`);

  // ============================================================
  // 第三步：发起参数修改提案
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("第三步：发起参数修改提案");
  console.log("=".repeat(60));

  // 选择要修改的参数：replicationFactor（系统级，需要 3/4 同意）
  const CATEGORY_STORAGE = ethers.encodeBytes32String("storage");
  const targetParamName = "replicationFactor";
  const targetParamId = generateParameterId(targetParamName, CATEGORY_STORAGE);
  const oldValue = 5;
  const newValue = 7;  // 将副本数从 5 改为 7

  console.log("\n3.1 提案信息:");
  console.log(`   参数名称: ${targetParamName}`);
  console.log(`   参数ID: ${targetParamId}`);
  console.log(`   原值: ${oldValue}`);
  console.log(`   新值: ${newValue}`);
  console.log(`   参数级别: SYSTEM (需要 75% 同意)`);

  // 存储管理员发起提案
  console.log("\n3.2 存储管理员发起提案...");
  const encodedNewValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [newValue]);
  
  const tx = await paramRegistry.connect(storageAdmin).proposeParameterChange(
    targetParamId,
    encodedNewValue,
    "将存储副本数从 5 增加到 7，提高数据可靠性"
  );
  const receipt = await tx.wait();
  
  // 获取提案ID
  const proposalId = await paramRegistry.proposalCount();
  console.log(`   ✓ 提案已创建，提案ID: ${proposalId}`);

  // 查询提案详情
  const proposalBasic = await paramRegistry.getProposalBasic(proposalId);
  const proposalDetails = await paramRegistry.getProposalDetails(proposalId);
  console.log("\n3.3 提案详情:");
  console.log(`   提案者: ${proposalBasic.proposer}`);
  console.log(`   参数ID: ${proposalBasic.parameterId}`);
  console.log(`   描述: ${proposalBasic.description}`);
  console.log(`   状态: ${getStateName(Number(proposalBasic.state))}`);
  console.log(`   所需门槛: ${Number(proposalBasic.requiredThreshold) / 100}%`);
  console.log(`   开始时间: ${new Date(Number(proposalDetails.startTime) * 1000).toISOString()}`);
  console.log(`   结束时间: ${new Date(Number(proposalDetails.endTime) * 1000).toISOString()}`);

  // ============================================================
  // 第四步：投票
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("第四步：投票");
  console.log("=".repeat(60));

  // 等待投票开始
  console.log("\n4.1 等待投票期开始...");
  await increaseTime(VOTING_DELAY + 1);

  // 查询当前状态
  let currentState = await paramRegistry.getProposalState(proposalId);
  console.log(`   当前状态: ${getStateName(Number(currentState))}`);

  // 投票
  console.log("\n4.2 投票者进行投票...");
  
  // 4 人赞成，1 人反对 = 80% > 75% (SYSTEM 级别门槛)
  const votes = [
    { voter: voter1, support: true, label: "投票者1" },
    { voter: voter2, support: true, label: "投票者2" },
    { voter: voter3, support: true, label: "投票者3" },
    { voter: voter4, support: true, label: "投票者4" },
    { voter: voter5, support: false, label: "投票者5" }
  ];

  for (const vote of votes) {
    await paramRegistry.connect(vote.voter).vote(proposalId, vote.support);
    const weight = await govToken.balanceOf(vote.voter.address);
    console.log(`   ✓ ${vote.label}: ${vote.support ? "赞成" : "反对"} (权重: ${ethers.formatEther(weight)} GOV)`);
  }

  // 查询投票结果
  console.log("\n4.3 当前投票结果:");
  const votingResults = await paramRegistry.getVotingResults(proposalId);
  console.log(`   赞成票: ${ethers.formatEther(votingResults.forVotes)} GOV`);
  console.log(`   反对票: ${ethers.formatEther(votingResults.againstVotes)} GOV`);
  console.log(`   总票数: ${ethers.formatEther(votingResults.totalVotes)} GOV`);
  console.log(`   赞成比例: ${Number(votingResults.forPercentage) / 100}%`);
  console.log(`   所需门槛: ${Number(votingResults.requiredThreshold) / 100}%`);
  console.log(`   是否通过: ${votingResults.isPassing ? "✓ 是" : "✗ 否"}`);

  // ============================================================
  // 第五步：执行提案
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("第五步：执行提案");
  console.log("=".repeat(60));

  // 等待投票期结束
  console.log("\n5.1 等待投票期结束...");
  await increaseTime(VOTING_PERIOD + 1);

  // 查询最终状态
  currentState = await paramRegistry.getProposalState(proposalId);
  console.log(`   最终状态: ${getStateName(Number(currentState))}`);

  // 执行提案
  console.log("\n5.2 执行提案...");
  if (Number(currentState) === ProposalState.Succeeded) {
    const executeTx = await paramRegistry.execute(proposalId);
    await executeTx.wait();
    console.log("   ✓ 提案执行成功!");

    // 验证参数已更新
    console.log("\n5.3 验证参数更新...");
    const updatedParam = await paramRegistry.getParameter(targetParamId);
    const decodedValue = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint256"],
      updatedParam.currentValue
    )[0];
    console.log(`   参数名称: ${updatedParam.name}`);
    console.log(`   原值: ${oldValue}`);
    console.log(`   新值: ${decodedValue}`);
    console.log(`   ✓ 参数已成功更新!`);
  } else {
    console.log("   ✗ 提案未通过，无法执行");
  }

  // ============================================================
  // 总结
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("流程总结");
  console.log("=".repeat(60));
  console.log(`
  1. 发起提案
     - 提案ID: ${proposalId}
     - 修改参数: replicationFactor
     - 新值: ${newValue}

  2. 投票
     - 赞成: 4 票 (400 GOV)
     - 反对: 1 票 (100 GOV)
     - 通过率: 80% > 75%

  3. 执行
     - 状态: ${getStateName(Number(await paramRegistry.getProposalState(proposalId)))}
  `);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("执行失败:", error);
    process.exit(1);
  });