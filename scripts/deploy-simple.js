const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  const results = [];

  results.push("========================================");
  results.push("Deploying contracts with account: " + deployer.address);
  const balance = ethers.formatEther(await ethers.provider.getBalance(deployer.address));
  results.push("Account balance: " + balance + " PUNK");
  results.push("========================================");

  // 1. Deploy MockERC20 as Governance Token
  results.push("1. Deploying Governance Token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const govToken = await MockERC20.deploy("Governance Token", "GOV");
  await govToken.waitForDeployment();
  const govTokenAddress = await govToken.getAddress();
  results.push("   Governance Token: " + govTokenAddress);

  // 2. Deploy Treasury Contract
  results.push("2. Deploying Treasury...");
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(govTokenAddress);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  results.push("   Treasury: " + treasuryAddress);

  // 3. Deploy ParameterRegistry Contract
  results.push("3. Deploying ParameterRegistry...");
  const ParameterRegistry = await ethers.getContractFactory("ParameterRegistry");
  const parameterRegistry = await ParameterRegistry.deploy(govTokenAddress, deployer.address);
  await parameterRegistry.waitForDeployment();
  const parameterRegistryAddress = await parameterRegistry.getAddress();
  results.push("   ParameterRegistry: " + parameterRegistryAddress);

  results.push("========================================");
  results.push("DEPLOYMENT COMPLETE");
  results.push("========================================");

  // Write results to file
  const output = {
    network: "PunkChain",
    chainId: 20251101,
    deployer: deployer.address,
    contracts: {
      GovernanceToken: govTokenAddress,
      Treasury: treasuryAddress,
      ParameterRegistry: parameterRegistryAddress
    },
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync("deployment-result.json", JSON.stringify(output, null, 2));
  results.push("Results saved to deployment-result.json");

  // Print all results
  for (const line of results) {
    console.log(line);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
