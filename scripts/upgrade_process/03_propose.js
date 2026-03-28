const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "deployed.json");
const STATE_PATH = path.join(__dirname, "state.json");

function generateParameterId(name, category) {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "bytes32"], [name, category])
  );
}

async function main() {
  const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));

  const provider = ethers.provider;
  const storageAdmin = new ethers.Wallet(
    "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
    provider
  );

  const paramRegistry = await ethers.getContractAt("ParameterRegistry", deployed.paramRegistry, storageAdmin);

  const CATEGORY_STORAGE = ethers.encodeBytes32String("storage");
  const targetParamName = "replicationFactor";
  const targetParamId = generateParameterId(targetParamName, CATEGORY_STORAGE);
  const newValue = 20;
  const encodedNewValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [newValue]);

  const tx = await paramRegistry.proposeParameterChange(
    targetParamId,
    encodedNewValue,
    "将存储副本数从 10 增加到 20，提高数据可靠性"
  );
  await tx.wait();

  const proposalId = await paramRegistry.proposalCount();

  const state = {
    proposalId: proposalId.toString(),
    parameterId: targetParamId,
    newValue
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  console.log("Proposal created:", state);
  console.log("Saved to:", STATE_PATH);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Propose failed:", error);
    process.exit(1);
  });
