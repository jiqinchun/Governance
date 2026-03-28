const hre = require("hardhat");

async function main() {
  console.log("Hardhat is working");
  const accounts = await hre.ethers.getSigners();
  console.log("Account 0:", accounts[0].address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
