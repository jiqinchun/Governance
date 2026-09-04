require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    punkchain: {
      url: "http://47.243.174.71:36054",
      chainId: 20260902,
      accounts: ["0xeeefa7075d12e965851eef8e2622377d480f8b9c99c30cb615cf222b699b491f"]
    }
  }
};
