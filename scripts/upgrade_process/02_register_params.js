const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYED_PATH = path.join(__dirname, "deployed.json");

const ParameterLevel = {
  APPLICATION: 0,
  SYSTEM: 1,
  INFRASTRUCTURE: 2
};

function generateParameterId(name, category) {
  return ethers.keccak256(
    ethers.solidityPacked(["string", "bytes32"], [name, category])
  );
}

async function main() {
  const deployed = JSON.parse(fs.readFileSync(DEPLOYED_PATH, "utf8"));

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

  const govToken = await ethers.getContractAt("MockERC20", deployed.govToken, deployer);
  const paramRegistry = await ethers.getContractAt("ParameterRegistry", deployed.paramRegistry, deployer);

  console.log("Registering parameters...");

  const CATEGORY_STORAGE = ethers.encodeBytes32String("storage");
  const storageParams = [
    { name: "maxFileSize", level: ParameterLevel.APPLICATION, initialValue: 1024 * 1024 * 100 },
    { name: "replicationFactor", level: ParameterLevel.SYSTEM, initialValue: 3 },
    { name: "shardSize", level: ParameterLevel.INFRASTRUCTURE, initialValue: 1024 * 1024 * 64 }
  ];

  const CATEGORY_EXECUTION = ethers.encodeBytes32String("execution");
  const executionParams = [
    { name: "minPowGas", level: ParameterLevel.SYSTEM, initialValue: 1000000 }
  ];

  for (const param of storageParams) {
    const paramId = generateParameterId(param.name, CATEGORY_STORAGE);
    const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [param.initialValue]);

    const info = await paramRegistry.parameters(paramId);
    if (info.isRegistered) {
      console.log(`- ${param.name} (storage) already registered`);
      continue;
    }

    const tx = await paramRegistry.registerParameter(
      paramId,
      param.name,
      param.level,
      CATEGORY_STORAGE,
      encodedValue
    );
    await tx.wait();
    console.log(`- ${param.name} (storage) registered`);
  }

  for (const param of executionParams) {
    const paramId = generateParameterId(param.name, CATEGORY_EXECUTION);
    const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [param.initialValue]);

    const info = await paramRegistry.parameters(paramId);
    if (info.isRegistered) {
      console.log(`- ${param.name} (execution) already registered`);
      continue;
    }

    const tx = await paramRegistry.registerParameter(
      paramId,
      param.name,
      param.level,
      CATEGORY_EXECUTION,
      encodedValue
    );
    await tx.wait();
    console.log(`- ${param.name} (execution) registered`);
  }

  console.log("Minting governance tokens...");
  const tokenAmount = ethers.parseEther("100");
  await (await govToken.mint(storageAdmin.address, ethers.parseEther("50"))).wait();
  await (await govToken.mint(voter1.address, tokenAmount)).wait();
  await (await govToken.mint(voter2.address, tokenAmount)).wait();
  await (await govToken.mint(voter3.address, tokenAmount)).wait();
  await (await govToken.mint(voter4.address, tokenAmount)).wait();
  await (await govToken.mint(voter5.address, tokenAmount)).wait();

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Register failed:", error);
    process.exit(1);
  });
