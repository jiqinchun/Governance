const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Treasury", function () {
  let Treasury;
  let treasury;
  let MockERC20;
  let punkToken;
  let govToken;
  let owner;
  let proposer;
  let voter1;
  let voter2;
  let recipient;

  const VOTING_DELAY = 24 * 60 * 60; // 1 day
  const VOTING_PERIOD = 3 * 24 * 60 * 60; // 3 days

  beforeEach(async function () {
    const network = await ethers.provider.getNetwork();
    console.log(`Network: ${network.name} (chainId=${network.chainId})`);
    const blockNumber = await ethers.provider.getBlockNumber();
    console.log(`Current block: ${blockNumber}`);

    [owner, proposer, voter1, voter2, recipient] = await ethers.getSigners();

    // Deploy Mock Tokens
    MockERC20 = await ethers.getContractFactory("MockERC20");
    punkToken = await MockERC20.deploy("Punk Token", "PUNK");
    await punkToken.waitForDeployment();
    console.log("PUNK token:", await punkToken.getAddress());
    govToken = await MockERC20.deploy("Governance Token", "GOV");

    // Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(await punkToken.getAddress(), await govToken.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await treasury.punkToken()).to.equal(await punkToken.getAddress());
      expect(await treasury.govToken()).to.equal(await govToken.getAddress());
    });
  });

  describe("Deposit (Inflow)", function () {
    it("Should allow depositing PUNK tokens", async function () {
      const amount = ethers.parseEther("100");
      await punkToken.mint(owner.address, amount);
      await punkToken.approve(await treasury.getAddress(), amount);

      await expect(treasury.deposit(amount, "Slashing Validator"))
        .to.emit(treasury, "Deposit")
        .withArgs(owner.address, amount, "Slashing Validator");

      expect(await punkToken.balanceOf(await treasury.getAddress())).to.equal(amount);
    });
  });

  describe("Governance Flow (Outflow)", function () {
    beforeEach(async function () {
      // Setup: Fund Treasury
      const fundAmount = ethers.parseEther("1000");
      await punkToken.mint(owner.address, fundAmount);
      await punkToken.approve(await treasury.getAddress(), fundAmount);
      await treasury.deposit(fundAmount, "Initial Funding");

      // Setup: Distribute Gov Tokens
      // Total Supply: 1000 GOV
      // Quorum needed (4%): 40 GOV
      await govToken.mint(proposer.address, ethers.parseEther("10")); // Not enough to pass alone if quorum was higher, but helps
      await govToken.mint(voter1.address, ethers.parseEther("100")); // 10%
      await govToken.mint(voter2.address, ethers.parseEther("50"));  // 5%
    });

    it("Should allow creating a proposal", async function () {
      const amount = ethers.parseEther("100");
      
      await expect(treasury.connect(proposer).propose(recipient.address, amount, "Grant for Devs"))
        .to.emit(treasury, "ProposalCreated")
        .withArgs(1, proposer.address, recipient.address, amount, "Grant for Devs");

      const proposal = await treasury.proposals(1);
      expect(proposal.proposer).to.equal(proposer.address);
      expect(proposal.target).to.equal(recipient.address);
      expect(proposal.amount).to.equal(amount);
    });

    it("Should not allow voting before start time", async function () {
      const amount = ethers.parseEther("100");
      await treasury.connect(proposer).propose(recipient.address, amount, "Grant");

      await expect(treasury.connect(voter1).vote(1, true))
        .to.be.revertedWith("Voting has not started");
    });

    it("Should execute a successful proposal", async function () {
      const amount = ethers.parseEther("100");
      await treasury.connect(proposer).propose(recipient.address, amount, "Grant");

      // Fast forward to voting period
      await time.increase(VOTING_DELAY + 1);

      // Vote
      await expect(treasury.connect(voter1).vote(1, true))
        .to.emit(treasury, "VoteCast")
        .withArgs(voter1.address, 1, true, ethers.parseEther("100"));

      // Fast forward to end of voting period
      await time.increase(VOTING_PERIOD + 1);

      // Execute
      const beforeBalance = await punkToken.balanceOf(recipient.address);
      
      await expect(treasury.execute(1))
        .to.emit(treasury, "ProposalExecuted")
        .withArgs(1);

      const afterBalance = await punkToken.balanceOf(recipient.address);
      expect(afterBalance - beforeBalance).to.equal(amount);
    });

    it("Should fail if quorum is not reached", async function () {
      // Increase total supply so small votes don't pass quorum
      // Quorum is 4%. If we mint a huge amount, 100 tokens might not be enough.
      // Let's mint 1,000,000 GOV to owner. Total supply ~1,000,160
      // 4% of 1M is 40,000. Voter1 has 100.
      await govToken.mint(owner.address, ethers.parseEther("1000000"));

      const amount = ethers.parseEther("100");
      await treasury.connect(proposer).propose(recipient.address, amount, "Grant");

      await time.increase(VOTING_DELAY + 1);
      await treasury.connect(voter1).vote(1, true);
      await time.increase(VOTING_PERIOD + 1);

      await expect(treasury.execute(1))
        .to.be.revertedWith("Quorum not reached");
    });

    it("Should fail if majority is against", async function () {
      const amount = ethers.parseEther("100");
      await treasury.connect(proposer).propose(recipient.address, amount, "Grant");

      await time.increase(VOTING_DELAY + 1);
      
      // Voter1 (100) votes Against
      await treasury.connect(voter1).vote(1, false);
      // Voter2 (50) votes For
      await treasury.connect(voter2).vote(1, true);

      await time.increase(VOTING_PERIOD + 1);

      await expect(treasury.execute(1))
        .to.be.revertedWith("Proposal failed");
    });
  });
});
