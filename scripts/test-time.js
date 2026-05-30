const { ethers } = require("hardhat");

async function main() {
  const paramRegistry = await ethers.getContractAt(
    "ParameterRegistry",
    "0xe36257F4a69b137a1DFECeFBfB73920091dbf888"
  );
  const pId = 1;
  const state = await paramRegistry.getProposalState(pId);
  const details = await paramRegistry.getProposalDetails(pId);
  const latest = await ethers.provider.getBlock("latest");

  console.log("State:", Number(state));
  console.log("End Time:", Number(details.endTime), new Date(Number(details.endTime) * 1000).toISOString());
  console.log("Block Time:", latest.timestamp, new Date(latest.timestamp * 1000).toISOString());
  console.log("Is targetTimestamp <= now ?", Number(details.endTime) <= latest.timestamp);
}

main().catch(console.error);
