const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("========================================");
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "PUNK");
  console.log("========================================\n");

  // 1. Deploy MockERC20 as Governance Token
  console.log("1. Deploying Governance Token (MockERC20)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const govToken = await MockERC20.deploy("Governance Token", "GOV");
  await govToken.waitForDeployment();
  const govTokenAddress = await govToken.getAddress();
  console.log("   Governance Token deployed to:", govTokenAddress);

  // 2. Deploy Treasury Contract
  console.log("\n2. Deploying Treasury Contract...");
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(govTokenAddress);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("   Treasury deployed to:", treasuryAddress);

  // 3. Deploy ParameterRegistry Contract
  console.log("\n3. Deploying ParameterRegistry Contract...");
  const ParameterRegistry = await ethers.getContractFactory("ParameterRegistry");
  // Use deployer address as executor for now (can be updated later)
  const parameterRegistry = await ParameterRegistry.deploy(govTokenAddress, deployer.address);
  await parameterRegistry.waitForDeployment();
  const parameterRegistryAddress = await parameterRegistry.getAddress();
  console.log("   ParameterRegistry deployed to:", parameterRegistryAddress);

  // Summary
  console.log("\n========================================");
  console.log("DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log("Network: PunkChain (Chain ID: 20251101)");
  console.log("Deployer:", deployer.address);
  console.log("----------------------------------------");
  console.log("Governance Token (GOV):", govTokenAddress);
  console.log("Treasury:", treasuryAddress);
  console.log("ParameterRegistry:", parameterRegistryAddress);
  console.log("========================================\n");

  // Verify deployment
  console.log("Verifying deployments...");
  
  const treasuryGovToken = await treasury.govToken();
  console.log("- Treasury govToken:", treasuryGovToken === govTokenAddress ? "✓ Correct" : "✗ Mismatch");
  
  const treasuryAdmin = await treasury.admin();
  console.log("- Treasury admin:", treasuryAdmin === deployer.address ? "✓ Correct" : "✗ Mismatch");

  const registryAdmin = await parameterRegistry.admin();
  console.log("- ParameterRegistry admin:", registryAdmin === deployer.address ? "✓ Correct" : "✗ Mismatch");

  console.log("\n✅ All contracts deployed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
