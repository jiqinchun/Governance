const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("UpgradeGovernance", function () {
  let UpgradeGovernance;
  let upgradeGovernance;
  let MockERC20;
  let govToken;
  let counterV1Impl;
  let counterV2Impl;
  let proxy;
  let counterV1Proxy;
  let owner;
  let registrar;
  let proposer;
  let voter1;
  let voter2;
  let voter3;
  let voter4;
  let voter5;
  let executor;
  let otherUser;

  const VOTING_DELAY = 60;
  const VOTING_PERIOD = 120;

  const ContractLevel = {
    APPLICATION: 0,
    SYSTEM: 1,
    INFRASTRUCTURE: 2
  };

  const ProposalState = {
    Pending: 0,
    Active: 1,
    Succeeded: 2,
    Defeated: 3,
    Executed: 4,
    Canceled: 5
  };

  const APPLICATION_THRESHOLD = 6667;
  const SYSTEM_THRESHOLD = 7500;
  const INFRASTRUCTURE_THRESHOLD = 8000;
  const CATEGORY_EXECUTION = ethers.encodeBytes32String("execution");

  beforeEach(async function () {
    [
      owner,
      registrar,
      proposer,
      voter1,
      voter2,
      voter3,
      voter4,
      voter5,
      executor,
      otherUser
    ] = await ethers.getSigners();

    MockERC20 = await ethers.getContractFactory("MockERC20");
    govToken = await MockERC20.deploy("Governance Token", "GOV");
    await govToken.waitForDeployment();

    UpgradeGovernance = await ethers.getContractFactory("UpgradeGovernance");
    upgradeGovernance = await UpgradeGovernance.deploy(await govToken.getAddress());
    await upgradeGovernance.waitForDeployment();

    const CounterV1 = await ethers.getContractFactory("UpgradeableCounterV1");
    counterV1Impl = await CounterV1.deploy();
    await counterV1Impl.waitForDeployment();

    const initData = CounterV1.interface.encodeFunctionData("initialize", [
      await upgradeGovernance.getAddress(),
      7
    ]);

    const ERC1967Proxy = await ethers.getContractFactory("TestERC1967Proxy");
    proxy = await ERC1967Proxy.deploy(await counterV1Impl.getAddress(), initData);
    await proxy.waitForDeployment();
    counterV1Proxy = await ethers.getContractAt("UpgradeableCounterV1", await proxy.getAddress());

    const CounterV2 = await ethers.getContractFactory("UpgradeableCounterV2");
    counterV2Impl = await CounterV2.deploy();
    await counterV2Impl.waitForDeployment();
  });

  async function registerProxy(level = ContractLevel.SYSTEM) {
    return upgradeGovernance.connect(registrar).registerUpgradeableContract(
      await proxy.getAddress(),
      "UpgradeableCounter",
      level,
      CATEGORY_EXECUTION,
      await counterV1Impl.getAddress()
    );
  }

  async function mintVotingTokens() {
    await govToken.mint(proposer.address, ethers.parseEther("10"));
    await govToken.mint(voter1.address, ethers.parseEther("100"));
    await govToken.mint(voter2.address, ethers.parseEther("100"));
    await govToken.mint(voter3.address, ethers.parseEther("100"));
    await govToken.mint(voter4.address, ethers.parseEther("100"));
    await govToken.mint(voter5.address, ethers.parseEther("100"));
  }

  function encodeV2Initializer(multiplier = 3) {
    return counterV2Impl.interface.encodeFunctionData("initializeV2", [multiplier]);
  }

  async function createProposal(level = ContractLevel.SYSTEM, callData = encodeV2Initializer()) {
    await registerProxy(level);
    await mintVotingTokens();

    await upgradeGovernance.connect(proposer).proposeUpgrade(
      await proxy.getAddress(),
      await counterV2Impl.getAddress(),
      callData,
      "Upgrade counter to V2"
    );

    return 1;
  }

  describe("Deployment", function () {
    it("Should set governance token", async function () {
      expect(await upgradeGovernance.govToken()).to.equal(await govToken.getAddress());
    });

    it("Should deploy a real ERC1967 UUPS proxy initialized through V1", async function () {
      expect(await counterV1Proxy.version()).to.equal("v1");
      expect(await counterV1Proxy.value()).to.equal(7);
      expect(await counterV1Proxy.upgradeAuthority()).to.equal(await upgradeGovernance.getAddress());
    });

    it("Should revert if governance token is zero address", async function () {
      await expect(UpgradeGovernance.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid governance token address");
    });
  });

  describe("Proxy Registration", function () {
    it("Should allow anyone to register an upgradeable proxy", async function () {
      await expect(registerProxy())
        .to.emit(upgradeGovernance, "UpgradeableContractRegistered")
        .withArgs(
          await proxy.getAddress(),
          registrar.address,
          "UpgradeableCounter",
          ContractLevel.SYSTEM,
          CATEGORY_EXECUTION,
          await counterV1Impl.getAddress()
        );

      const info = await upgradeGovernance.getUpgradeableContract(await proxy.getAddress());
      expect(info.registeredProxy).to.equal(await proxy.getAddress());
      expect(info.name).to.equal("UpgradeableCounter");
      expect(info.level).to.equal(ContractLevel.SYSTEM);
      expect(info.category).to.equal(CATEGORY_EXECUTION);
      expect(info.isRegistered).to.equal(true);
      expect(info.currentImplementation).to.equal(await counterV1Impl.getAddress());
      expect(info.registeredBy).to.equal(registrar.address);
      expect(info.threshold).to.equal(SYSTEM_THRESHOLD);
    });

    it("Should add proxy to registered proxy list", async function () {
      await registerProxy();

      expect(await upgradeGovernance.getRegisteredProxyCount()).to.equal(1);
      const proxies = await upgradeGovernance.getAllRegisteredProxies();
      expect(proxies).to.include(await proxy.getAddress());
    });

    it("Should not allow duplicate proxy registration", async function () {
      await registerProxy();

      await expect(registerProxy())
        .to.be.revertedWith("Proxy already registered");
    });
  });

  describe("Upgrade Proposal", function () {
    it("Should allow a governance token holder to create an upgrade proposal", async function () {
      await registerProxy();
      await mintVotingTokens();

      const callData = encodeV2Initializer(5);
      await expect(upgradeGovernance.connect(proposer).proposeUpgrade(
        await proxy.getAddress(),
        await counterV2Impl.getAddress(),
        callData,
        "Upgrade counter to V2"
      )).to.emit(upgradeGovernance, "UpgradeProposalCreated");

      expect(await upgradeGovernance.proposalCount()).to.equal(1);

      const basic = await upgradeGovernance.getProposalBasic(1);
      expect(basic.proposer).to.equal(proposer.address);
      expect(basic.proxy).to.equal(await proxy.getAddress());
      expect(basic.description).to.equal("Upgrade counter to V2");
      expect(basic.state).to.equal(ProposalState.Pending);
      expect(basic.requiredThreshold).to.equal(SYSTEM_THRESHOLD);

      const upgrade = await upgradeGovernance.getProposalUpgrade(1);
      expect(upgrade.oldImplementation).to.equal(await counterV1Impl.getAddress());
      expect(upgrade.newImplementation).to.equal(await counterV2Impl.getAddress());

      const details = await upgradeGovernance.getProposalDetails(1);
      expect(details.callData).to.equal(callData);
      expect(details.executed).to.equal(false);
      expect(details.canceled).to.equal(false);
    });

    it("Should track proposal history for a proxy", async function () {
      await registerProxy();
      await mintVotingTokens();

      await upgradeGovernance.connect(proposer).proposeUpgrade(
        await proxy.getAddress(),
        await counterV2Impl.getAddress(),
        encodeV2Initializer(2),
        "Proposal 1"
      );

      const CounterV2B = await ethers.getContractFactory("UpgradeableCounterV2");
      const anotherV2 = await CounterV2B.deploy();
      await anotherV2.waitForDeployment();

      await upgradeGovernance.connect(proposer).proposeUpgrade(
        await proxy.getAddress(),
        await anotherV2.getAddress(),
        encodeV2Initializer(4),
        "Proposal 2"
      );

      const history = await upgradeGovernance.getProxyProposalHistory(await proxy.getAddress());
      expect(history.length).to.equal(2);
      expect(history[0]).to.equal(1n);
      expect(history[1]).to.equal(2n);
    });

    it("Should revert if proposer has no governance tokens", async function () {
      await registerProxy();

      await expect(upgradeGovernance.connect(otherUser).proposeUpgrade(
        await proxy.getAddress(),
        await counterV2Impl.getAddress(),
        encodeV2Initializer(),
        "Invalid proposal"
      )).to.be.revertedWith("Must hold governance tokens to propose");
    });

    it("Should revert if proxy is not registered", async function () {
      await govToken.mint(proposer.address, ethers.parseEther("10"));

      await expect(upgradeGovernance.connect(proposer).proposeUpgrade(
        await proxy.getAddress(),
        await counterV2Impl.getAddress(),
        encodeV2Initializer(),
        "Unknown proxy"
      )).to.be.revertedWith("Proxy not registered");
    });

    it("Should revert if implementation is unchanged", async function () {
      await registerProxy();
      await mintVotingTokens();

      await expect(upgradeGovernance.connect(proposer).proposeUpgrade(
        await proxy.getAddress(),
        await counterV1Impl.getAddress(),
        "0x",
        "No-op upgrade"
      )).to.be.revertedWith("Implementation unchanged");
    });
  });

  describe("Voting", function () {
    beforeEach(async function () {
      await createProposal();
    });

    it("Should not allow voting before start time", async function () {
      await expect(upgradeGovernance.connect(voter1).vote(1, true))
        .to.be.revertedWith("Voting not started");
    });

    it("Should allow voting after start time", async function () {
      await time.increase(VOTING_DELAY + 1);

      await expect(upgradeGovernance.connect(voter1).vote(1, true))
        .to.emit(upgradeGovernance, "VoteCast")
        .withArgs(1, voter1.address, true, ethers.parseEther("100"));

      expect(await upgradeGovernance.hasVoted(1, voter1.address)).to.equal(true);
    });

    it("Should record votes and calculate passing status like parameter governance", async function () {
      await time.increase(VOTING_DELAY + 1);

      await upgradeGovernance.connect(voter1).vote(1, true);
      await upgradeGovernance.connect(voter2).vote(1, true);
      await upgradeGovernance.connect(voter3).vote(1, true);
      await upgradeGovernance.connect(voter4).vote(1, false);

      const results = await upgradeGovernance.getVotingResults(1);
      expect(results.forVotes).to.equal(ethers.parseEther("300"));
      expect(results.againstVotes).to.equal(ethers.parseEther("100"));
      expect(results.totalVotes).to.equal(ethers.parseEther("400"));
      expect(results.forPercentage).to.equal(7500);
      expect(results.requiredThreshold).to.equal(SYSTEM_THRESHOLD);
      expect(results.isPassing).to.equal(true);
    });

    it("Should not allow voting twice", async function () {
      await time.increase(VOTING_DELAY + 1);

      await upgradeGovernance.connect(voter1).vote(1, true);

      await expect(upgradeGovernance.connect(voter1).vote(1, false))
        .to.be.revertedWith("Already voted");
    });
  });

  describe("Execute Upgrade", function () {
    it("Should allow anyone to execute a successful real UUPS upgrade proposal", async function () {
      const callData = encodeV2Initializer(3);
      await createProposal(ContractLevel.SYSTEM, callData);

      await time.increase(VOTING_DELAY + 1);
      await upgradeGovernance.connect(voter1).vote(1, true);
      await upgradeGovernance.connect(voter2).vote(1, true);
      await upgradeGovernance.connect(voter3).vote(1, true);
      await upgradeGovernance.connect(voter4).vote(1, false);
      await time.increase(VOTING_PERIOD + 1);

      expect(await counterV1Proxy.version()).to.equal("v1");
      expect(await upgradeGovernance.getProposalState(1)).to.equal(ProposalState.Succeeded);

      await expect(upgradeGovernance.connect(otherUser).executeUpgrade(1))
        .to.emit(upgradeGovernance, "UpgradeExecuted")
        .withArgs(
          1,
          await proxy.getAddress(),
          await counterV1Impl.getAddress(),
          await counterV2Impl.getAddress(),
          callData
        );

      const counterV2Proxy = await ethers.getContractAt("UpgradeableCounterV2", await proxy.getAddress());
      expect(await counterV2Proxy.version()).to.equal("v2");
      expect(await counterV2Proxy.value()).to.equal(7);
      expect(await counterV2Proxy.multiplier()).to.equal(3);

      await counterV2Proxy.increment();
      expect(await counterV2Proxy.value()).to.equal(10);

      const info = await upgradeGovernance.getUpgradeableContract(await proxy.getAddress());
      expect(info.currentImplementation).to.equal(await counterV2Impl.getAddress());

      const state = await upgradeGovernance.getProposalState(1);
      expect(state).to.equal(ProposalState.Executed);
    });

    it("Should fail execution if proposal does not meet threshold", async function () {
      await createProposal(ContractLevel.INFRASTRUCTURE);

      await time.increase(VOTING_DELAY + 1);
      await upgradeGovernance.connect(voter1).vote(1, true);
      await upgradeGovernance.connect(voter2).vote(1, true);
      await upgradeGovernance.connect(voter3).vote(1, true);
      await upgradeGovernance.connect(voter4).vote(1, false);
      await upgradeGovernance.connect(voter5).vote(1, false);
      await time.increase(VOTING_PERIOD + 1);

      expect(await upgradeGovernance.getProposalState(1)).to.equal(ProposalState.Defeated);

      await expect(upgradeGovernance.executeUpgrade(1))
        .to.be.revertedWith("Proposal not succeeded");
    });

    it("Should not allow executing before voting ends", async function () {
      await createProposal();

      await time.increase(VOTING_DELAY + 1);
      await upgradeGovernance.connect(voter1).vote(1, true);

      await expect(upgradeGovernance.executeUpgrade(1))
        .to.be.revertedWith("Voting not ended");
    });

    it("Should not allow executing twice", async function () {
      await createProposal();

      await time.increase(VOTING_DELAY + 1);
      await upgradeGovernance.connect(voter1).vote(1, true);
      await upgradeGovernance.connect(voter2).vote(1, true);
      await upgradeGovernance.connect(voter3).vote(1, true);
      await upgradeGovernance.connect(voter4).vote(1, false);
      await time.increase(VOTING_PERIOD + 1);

      await upgradeGovernance.executeUpgrade(1);

      await expect(upgradeGovernance.executeUpgrade(1))
        .to.be.revertedWith("Already executed");
    });

    it("Should fail if the UUPS proxy rejects non-governance upgrades", async function () {
      await expect(counterV1Proxy.connect(otherUser).upgradeToAndCall(
        await counterV2Impl.getAddress(),
        encodeV2Initializer()
      )).to.be.revertedWith("Only upgrade authority");
    });
  });

  describe("Cancel", function () {
    beforeEach(async function () {
      await createProposal();
    });

    it("Should allow proposer to cancel before voting ends", async function () {
      await expect(upgradeGovernance.connect(proposer).cancel(1))
        .to.emit(upgradeGovernance, "ProposalCanceled")
        .withArgs(1);

      expect(await upgradeGovernance.getProposalState(1)).to.equal(ProposalState.Canceled);
    });

    it("Should not allow non-proposer to cancel", async function () {
      await expect(upgradeGovernance.connect(voter1).cancel(1))
        .to.be.revertedWith("Only proposer can cancel");
    });

    it("Should not allow canceling after voting ends", async function () {
      await time.increase(VOTING_DELAY + VOTING_PERIOD + 1);

      await expect(upgradeGovernance.connect(proposer).cancel(1))
        .to.be.revertedWith("Voting already ended");
    });
  });

  describe("Thresholds", function () {
    it("Should return same level thresholds as parameter governance", async function () {
      expect(await upgradeGovernance.getThresholdForLevel(ContractLevel.APPLICATION))
        .to.equal(APPLICATION_THRESHOLD);
      expect(await upgradeGovernance.getThresholdForLevel(ContractLevel.SYSTEM))
        .to.equal(SYSTEM_THRESHOLD);
      expect(await upgradeGovernance.getThresholdForLevel(ContractLevel.INFRASTRUCTURE))
        .to.equal(INFRASTRUCTURE_THRESHOLD);
    });
  });
});
