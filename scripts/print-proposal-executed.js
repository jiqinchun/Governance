const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "upgrade_process", "deployed.json");
const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));

const PARAM_REGISTRY = deployed.paramRegistry;

function tryDecodeUint256(data) {
  try {
    return ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], data)[0].toString();
  } catch {
    return null;
  }
}

async function main() {
  const provider = ethers.provider;
  const paramRegistry = await ethers.getContractAt("ParameterRegistry", PARAM_REGISTRY);

  const filter = paramRegistry.filters.ProposalExecuted();
  const events = await paramRegistry.queryFilter(filter, 0, "latest");

  console.log(`ProposalExecuted events: ${events.length}`);

  for (const evt of events) {
    const { proposalId, parameterId, oldValue, newValue } = evt.args;
    const oldDecoded = tryDecodeUint256(oldValue);
    const newDecoded = tryDecodeUint256(newValue);

    console.log("------------------------------");
    console.log("block:", evt.blockNumber);
    console.log("tx:", evt.transactionHash);
    console.log("proposalId:", proposalId.toString());
    console.log("parameterId:", parameterId);
    console.log("oldValue(hex):", oldValue);
    console.log("newValue(hex):", newValue);
    if (oldDecoded !== null || newDecoded !== null) {
      console.log("oldValue(uint256):", oldDecoded ?? "<decode failed>");
      console.log("newValue(uint256):", newDecoded ?? "<decode failed>");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("执行失败:", error);
    process.exit(1);
  });
