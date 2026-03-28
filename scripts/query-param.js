const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "upgrade_process", "deployed.json");
const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));

function generateParameterId(name, category) {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "bytes32"], [name, category])
  );
}

async function main() {
    const provider = ethers.provider;
    const deployer = new ethers.Wallet(
        "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
        provider
    );
    const paramRegistry = await ethers.getContractAt("ParameterRegistry", deployed.paramRegistry, deployer);

    const CATEGORY_STORAGE = ethers.encodeBytes32String("storage");
    const param = { name: "replicationFactor", level: 1, initialValue: 3 };
    const paramId = generateParameterId(param.name, CATEGORY_STORAGE);

    const info = await paramRegistry.parameters(paramId);

    console.log("Parameter Info:", info);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("执行失败:", error);
    process.exit(1);
  });