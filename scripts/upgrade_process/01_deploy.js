const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const OUTPUT_PATH = path.join(__dirname, "deployed.json");

async function main() {
  const provider = ethers.provider;
  const deployer = new ethers.Wallet(
    "eeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f",
    provider
  );

  console.log("Deploying with:", deployer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const govToken = await MockERC20.deploy("Governance Token", "GOV");
  await govToken.waitForDeployment();

  const ParameterRegistry = await ethers.getContractFactory("ParameterRegistry", deployer);
  const paramRegistry = await ParameterRegistry.deploy(
    await govToken.getAddress(),
    deployer.address
  );
  await paramRegistry.waitForDeployment();

  const deployed = {
    govToken: await govToken.getAddress(),
    paramRegistry: await paramRegistry.getAddress(),
    deployer: deployer.address
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deployed, null, 2));

  console.log("Deployed:", deployed);
  console.log("Saved to:", OUTPUT_PATH);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deploy failed:", error);
    process.exit(1);
  });
