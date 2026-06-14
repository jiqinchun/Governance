require("@nomicfoundation/hardhat-toolbox");

const punkchainPrivateKey = process.env.PUNKCHAIN_PRIVATE_KEY;

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
      chainId: 20260418,
      accounts: punkchainPrivateKey ? [punkchainPrivateKey] : []
    }
  }
};
