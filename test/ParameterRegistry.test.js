const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ParameterRegistry", function () {
  let ParameterRegistry;
  let parameterRegistry;
  let MockERC20;
  let govToken;
  let owner;
  let admin;
  let executor;
  let proposer;
  let voter1;
  let voter2;
  let voter3;
  let voter4;
  let voter5;
  let otherUser;

  // Constants
  const VOTING_DELAY = 24 * 60 * 60; // 1 day in seconds
  const VOTING_PERIOD = 5 * 24 * 60 * 60; // 5 days in seconds
  const BASIS_POINTS = 10000;

  // Thresholds
  const APPLICATION_THRESHOLD = 6667;   // 2/3 = 66.67%
  const SYSTEM_THRESHOLD = 7500;        // 3/4 = 75%
  const INFRASTRUCTURE_THRESHOLD = 8000; // 4/5 = 80%

  // Parameter Levels
  const LEVEL_APPLICATION = 0;
  const LEVEL_SYSTEM = 1;
  const LEVEL_INFRASTRUCTURE = 2;

  // Test parameters
  const CATEGORY_EXECUTION = ethers.encodeBytes32String("execution");
  const CATEGORY_CLIENT = ethers.encodeBytes32String("client");
  const CATEGORY_CONSENSUS = ethers.encodeBytes32String("consensus");

  // Helper to generate parameter ID
  function generateParameterId(name, category) {
    return ethers.keccak256(ethers.solidityPacked(["string", "bytes32"], [name, category]));
  }

  beforeEach(async function () {
    [owner, admin, executor, proposer, voter1, voter2, voter3, voter4, voter5, otherUser] = await ethers.getSigners();

    // Deploy Mock Governance Token
    MockERC20 = await ethers.getContractFactory("MockERC20");
    govToken = await MockERC20.deploy("Governance Token", "GOV");
    await govToken.waitForDeployment();

    // Deploy ParameterRegistry
    ParameterRegistry = await ethers.getContractFactory("ParameterRegistry");
    parameterRegistry = await ParameterRegistry.deploy(
      await govToken.getAddress(),
      executor.address
    );
    await parameterRegistry.waitForDeployment();
  });

  // ============ Deployment Tests ============
  describe("Deployment", function () {
    it("Should set the correct governance token address", async function () {
      expect(await parameterRegistry.govToken()).to.equal(await govToken.getAddress());
    });

    it("Should set deployer as admin", async function () {
      expect(await parameterRegistry.admin()).to.equal(owner.address);
    });

    it("Should set the executor address", async function () {
      expect(await parameterRegistry.executor()).to.equal(executor.address);
    });

    it("Should revert if governance token address is zero", async function () {
      await expect(ParameterRegistry.deploy(ethers.ZeroAddress, executor.address))
        .to.be.revertedWith("Invalid governance token address");
    });

    it("Should revert if executor address is zero", async function () {
      await expect(ParameterRegistry.deploy(await govToken.getAddress(), ethers.ZeroAddress))
        .to.be.revertedWith("Invalid executor address");
    });
  });

  // ============ Parameter Registration Tests ============
  describe("Parameter Registration", function () {
    it("Should allow admin to register an APPLICATION level parameter", async function () {
      const paramId = generateParameterId("maxTransactionSize", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1000000]);

      await expect(parameterRegistry.registerParameter(
        paramId,
        "maxTransactionSize",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      ))
        .to.emit(parameterRegistry, "ParameterRegistered")
        .withArgs(paramId, "maxTransactionSize", LEVEL_APPLICATION, CATEGORY_EXECUTION);

      const param = await parameterRegistry.getParameter(paramId);
      expect(param.name).to.equal("maxTransactionSize");
      expect(param.level).to.equal(LEVEL_APPLICATION);
      expect(param.category).to.equal(CATEGORY_EXECUTION);
      expect(param.isRegistered).to.equal(true);
      expect(param.threshold).to.equal(APPLICATION_THRESHOLD);
    });

    it("Should allow admin to register a SYSTEM level parameter", async function () {
      const paramId = generateParameterId("blockGasLimit", CATEGORY_CLIENT);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [30000000]);

      await parameterRegistry.registerParameter(
        paramId,
        "blockGasLimit",
        LEVEL_SYSTEM,
        CATEGORY_CLIENT,
        initialValue
      );

      const param = await parameterRegistry.getParameter(paramId);
      expect(param.level).to.equal(LEVEL_SYSTEM);
      expect(param.threshold).to.equal(SYSTEM_THRESHOLD);
    });

    it("Should allow admin to register an INFRASTRUCTURE level parameter", async function () {
      const paramId = generateParameterId("consensusTimeout", CATEGORY_CONSENSUS);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [3000]);

      await parameterRegistry.registerParameter(
        paramId,
        "consensusTimeout",
        LEVEL_INFRASTRUCTURE,
        CATEGORY_CONSENSUS,
        initialValue
      );

      const param = await parameterRegistry.getParameter(paramId);
      expect(param.level).to.equal(LEVEL_INFRASTRUCTURE);
      expect(param.threshold).to.equal(INFRASTRUCTURE_THRESHOLD);
    });

    it("Should revert if non-admin tries to register parameter", async function () {
      const paramId = generateParameterId("testParam", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await expect(parameterRegistry.connect(otherUser).registerParameter(
        paramId,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      )).to.be.revertedWith("Only admin can call this function");
    });

    it("Should revert if parameter ID is zero", async function () {
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await expect(parameterRegistry.registerParameter(
        ethers.ZeroHash,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      )).to.be.revertedWith("Invalid parameter ID");
    });

    it("Should revert if parameter already registered", async function () {
      const paramId = generateParameterId("testParam", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await parameterRegistry.registerParameter(
        paramId,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      );

      await expect(parameterRegistry.registerParameter(
        paramId,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      )).to.be.revertedWith("Parameter already registered");
    });

    it("Should revert if name is empty", async function () {
      const paramId = generateParameterId("testParam", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await expect(parameterRegistry.registerParameter(
        paramId,
        "",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      )).to.be.revertedWith("Name cannot be empty");
    });

    it("Should add parameter to registeredParameters array", async function () {
      const paramId = generateParameterId("testParam", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await parameterRegistry.registerParameter(
        paramId,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      );

      const allParams = await parameterRegistry.getAllParameters();
      expect(allParams).to.include(paramId);
    });
  });

  // ============ Update Parameter Level Tests ============
  describe("Update Parameter Level", function () {
    let paramId;

    beforeEach(async function () {
      paramId = generateParameterId("testParam", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await parameterRegistry.registerParameter(
        paramId,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      );
    });

    it("Should allow admin to update parameter level", async function () {
      await expect(parameterRegistry.updateParameterLevel(paramId, LEVEL_SYSTEM))
        .to.emit(parameterRegistry, "ParameterLevelUpdated")
        .withArgs(paramId, LEVEL_APPLICATION, LEVEL_SYSTEM);

      const param = await parameterRegistry.getParameter(paramId);
      expect(param.level).to.equal(LEVEL_SYSTEM);
      expect(param.threshold).to.equal(SYSTEM_THRESHOLD);
    });

    it("Should revert if non-admin tries to update", async function () {
      await expect(parameterRegistry.connect(otherUser).updateParameterLevel(paramId, LEVEL_SYSTEM))
        .to.be.revertedWith("Only admin can call this function");
    });

    it("Should revert if parameter not registered", async function () {
      const unknownParamId = generateParameterId("unknown", CATEGORY_EXECUTION);
      await expect(parameterRegistry.updateParameterLevel(unknownParamId, LEVEL_SYSTEM))
        .to.be.revertedWith("Parameter not registered");
    });
  });

  // ============ Proposal Tests ============
  describe("Proposal Functions", function () {
    let paramId;
    let initialValue;
    let newValue;

    beforeEach(async function () {
      // Register a parameter
      paramId = generateParameterId("blockSize", CATEGORY_EXECUTION);
      initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1000000]);
      newValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [2000000]);

      await parameterRegistry.registerParameter(
        paramId,
        "blockSize",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      );

      // Distribute governance tokens
      await govToken.mint(proposer.address, ethers.parseEther("10"));
      await govToken.mint(voter1.address, ethers.parseEther("100"));
      await govToken.mint(voter2.address, ethers.parseEther("100"));
      await govToken.mint(voter3.address, ethers.parseEther("100"));
      await govToken.mint(voter4.address, ethers.parseEther("100"));
      await govToken.mint(voter5.address, ethers.parseEther("100"));
    });

    describe("proposeParameterChange", function () {
      it("Should allow creating a proposal", async function () {
        await expect(parameterRegistry.connect(proposer).proposeParameterChange(
          paramId,
          newValue,
          "Increase block size"
        ))
          .to.emit(parameterRegistry, "ParameterProposalCreated");

        expect(await parameterRegistry.proposalCount()).to.equal(1);
      });

      it("Should store correct proposal data", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          paramId,
          newValue,
          "Increase block size"
        );

        const proposal = await parameterRegistry.getProposal(1);
        expect(proposal.proposer).to.equal(proposer.address);
        expect(proposal.parameterId).to.equal(paramId);
        expect(proposal.description).to.equal("Increase block size");
        expect(proposal.executed).to.equal(false);
        expect(proposal.canceled).to.equal(false);
      });

      it("Should revert if proposer has no governance tokens", async function () {
        await expect(parameterRegistry.connect(otherUser).proposeParameterChange(
          paramId,
          newValue,
          "Invalid proposal"
        )).to.be.revertedWith("Must hold governance tokens to propose");
      });

      it("Should revert if parameter not registered", async function () {
        const unknownParamId = generateParameterId("unknown", CATEGORY_EXECUTION);
        await expect(parameterRegistry.connect(proposer).proposeParameterChange(
          unknownParamId,
          newValue,
          "Unknown param"
        )).to.be.revertedWith("Parameter not registered");
      });

      it("Should revert if new value is empty", async function () {
        await expect(parameterRegistry.connect(proposer).proposeParameterChange(
          paramId,
          "0x",
          "Empty value"
        )).to.be.revertedWith("New value cannot be empty");
      });
    });

    describe("vote", function () {
      beforeEach(async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          paramId,
          newValue,
          "Test proposal"
        );
      });

      it("Should not allow voting before start time", async function () {
        await expect(parameterRegistry.connect(voter1).vote(1, true))
          .to.be.revertedWith("Voting not started");
      });

      it("Should allow voting after start time", async function () {
        await time.increase(VOTING_DELAY + 1);

        await expect(parameterRegistry.connect(voter1).vote(1, true))
          .to.emit(parameterRegistry, "VoteCast")
          .withArgs(1, voter1.address, true, ethers.parseEther("100"));
      });

      it("Should record votes correctly", async function () {
        await time.increase(VOTING_DELAY + 1);

        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, false);

        const results = await parameterRegistry.getVotingResults(1);
        expect(results.forVotes).to.equal(ethers.parseEther("100"));
        expect(results.againstVotes).to.equal(ethers.parseEther("100"));
      });

      it("Should not allow voting twice", async function () {
        await time.increase(VOTING_DELAY + 1);
        await parameterRegistry.connect(voter1).vote(1, true);

        await expect(parameterRegistry.connect(voter1).vote(1, false))
          .to.be.revertedWith("Already voted");
      });

      it("Should not allow voting after end time", async function () {
        await time.increase(VOTING_DELAY + VOTING_PERIOD + 1);

        await expect(parameterRegistry.connect(voter1).vote(1, true))
          .to.be.revertedWith("Voting ended");
      });

      it("Should not allow voting without governance tokens", async function () {
        await time.increase(VOTING_DELAY + 1);

        await expect(parameterRegistry.connect(otherUser).vote(1, true))
          .to.be.revertedWith("No voting power");
      });
    });

    describe("execute", function () {
      beforeEach(async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          paramId,
          newValue,
          "Test proposal"
        );
      });

      it("Should not allow execution before voting ends", async function () {
        await time.increase(VOTING_DELAY + 1);
        await parameterRegistry.connect(voter1).vote(1, true);

        await expect(parameterRegistry.execute(1))
          .to.be.revertedWith("Voting not ended");
      });

      it("Should execute successful APPLICATION level proposal (>= 2/3 votes)", async function () {
        await time.increase(VOTING_DELAY + 1);

        // 3 out of 4 voters vote for (75% > 66.67%)
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, true);
        await parameterRegistry.connect(voter4).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        await expect(parameterRegistry.execute(1))
          .to.emit(parameterRegistry, "ProposalExecuted")
          .withArgs(1, paramId, initialValue, newValue);

        const param = await parameterRegistry.getParameter(paramId);
        expect(param.currentValue).to.equal(newValue);
      });

      it("Should fail if APPLICATION level proposal doesn't reach 2/3 threshold", async function () {
        await time.increase(VOTING_DELAY + 1);

        // 2 out of 4 voters vote for (50% < 66.67%)
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, false);
        await parameterRegistry.connect(voter4).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        await expect(parameterRegistry.execute(1))
          .to.be.revertedWith("Proposal not succeeded");
      });
    });

    describe("cancel", function () {
      beforeEach(async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          paramId,
          newValue,
          "Test proposal"
        );
      });

      it("Should allow proposer to cancel", async function () {
        await expect(parameterRegistry.connect(proposer).cancel(1))
          .to.emit(parameterRegistry, "ProposalCanceled")
          .withArgs(1);
      });

      it("Should not allow non-proposer to cancel", async function () {
        await expect(parameterRegistry.connect(voter1).cancel(1))
          .to.be.revertedWith("Only proposer can cancel");
      });

      it("Should not allow canceling after voting ends", async function () {
        await time.increase(VOTING_DELAY + VOTING_PERIOD + 1);

        await expect(parameterRegistry.connect(proposer).cancel(1))
          .to.be.revertedWith("Voting already ended");
      });
    });
  });

  // ============ Threshold Tests ============
  describe("Voting Thresholds", function () {
    let applicationParamId;
    let systemParamId;
    let infrastructureParamId;
    let newValue;

    beforeEach(async function () {
      newValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [999]);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      // Register parameters with different levels
      applicationParamId = generateParameterId("appParam", CATEGORY_EXECUTION);
      await parameterRegistry.registerParameter(
        applicationParamId,
        "appParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      );

      systemParamId = generateParameterId("sysParam", CATEGORY_CLIENT);
      await parameterRegistry.registerParameter(
        systemParamId,
        "sysParam",
        LEVEL_SYSTEM,
        CATEGORY_CLIENT,
        initialValue
      );

      infrastructureParamId = generateParameterId("infraParam", CATEGORY_CONSENSUS);
      await parameterRegistry.registerParameter(
        infrastructureParamId,
        "infraParam",
        LEVEL_INFRASTRUCTURE,
        CATEGORY_CONSENSUS,
        initialValue
      );

      // Distribute governance tokens evenly
      await govToken.mint(proposer.address, ethers.parseEther("10"));
      await govToken.mint(voter1.address, ethers.parseEther("100"));
      await govToken.mint(voter2.address, ethers.parseEther("100"));
      await govToken.mint(voter3.address, ethers.parseEther("100"));
      await govToken.mint(voter4.address, ethers.parseEther("100"));
      await govToken.mint(voter5.address, ethers.parseEther("100"));
    });

    describe("APPLICATION level (2/3 = 66.67%)", function () {
      it("Should pass when votes exceed 2/3 threshold", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          applicationParamId,
          newValue,
          "App param change"
        );

        await time.increase(VOTING_DELAY + 1);

        // 3 for, 1 against = 75% > 66.67%
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, true);
        await parameterRegistry.connect(voter4).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        const state = await parameterRegistry.getProposalState(1);
        expect(state).to.equal(2); // Succeeded

        await parameterRegistry.execute(1);
      });

      it("Should fail when votes are below 2/3 threshold", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          applicationParamId,
          newValue,
          "App param change"
        );

        await time.increase(VOTING_DELAY + 1);

        // 1 for, 2 against = 33.33% < 66.67%
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, false);
        await parameterRegistry.connect(voter3).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        const state = await parameterRegistry.getProposalState(1);
        expect(state).to.equal(3); // Defeated
      });
    });

    describe("SYSTEM level (3/4 = 75%)", function () {
      it("Should pass with exactly 3/4 votes", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          systemParamId,
          newValue,
          "System param change"
        );

        await time.increase(VOTING_DELAY + 1);

        // 3 for, 1 against = 75%
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, true);
        await parameterRegistry.connect(voter4).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        const state = await parameterRegistry.getProposalState(1);
        expect(state).to.equal(2); // Succeeded

        await parameterRegistry.execute(1);
      });

      it("Should fail with less than 3/4 votes", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          systemParamId,
          newValue,
          "System param change"
        );

        await time.increase(VOTING_DELAY + 1);

        // 2 for, 2 against = 50%
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, false);
        await parameterRegistry.connect(voter4).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        const state = await parameterRegistry.getProposalState(1);
        expect(state).to.equal(3); // Defeated
      });
    });

    describe("INFRASTRUCTURE level (4/5 = 80%)", function () {
      it("Should pass with exactly 4/5 votes", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          infrastructureParamId,
          newValue,
          "Infra param change"
        );

        await time.increase(VOTING_DELAY + 1);

        // 4 for, 1 against = 80%
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, true);
        await parameterRegistry.connect(voter4).vote(1, true);
        await parameterRegistry.connect(voter5).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        const state = await parameterRegistry.getProposalState(1);
        expect(state).to.equal(2); // Succeeded

        await parameterRegistry.execute(1);
      });

      it("Should fail with less than 4/5 votes", async function () {
        await parameterRegistry.connect(proposer).proposeParameterChange(
          infrastructureParamId,
          newValue,
          "Infra param change"
        );

        await time.increase(VOTING_DELAY + 1);

        // 3 for, 2 against = 60%
        await parameterRegistry.connect(voter1).vote(1, true);
        await parameterRegistry.connect(voter2).vote(1, true);
        await parameterRegistry.connect(voter3).vote(1, true);
        await parameterRegistry.connect(voter4).vote(1, false);
        await parameterRegistry.connect(voter5).vote(1, false);

        await time.increase(VOTING_PERIOD + 1);

        const state = await parameterRegistry.getProposalState(1);
        expect(state).to.equal(3); // Defeated
      });
    });
  });

  // ============ Admin Functions Tests ============
  describe("Admin Functions", function () {
    describe("setExecutor", function () {
      it("Should allow admin to update executor", async function () {
        const newExecutor = admin.address;
        
        await expect(parameterRegistry.setExecutor(newExecutor))
          .to.emit(parameterRegistry, "ExecutorUpdated")
          .withArgs(executor.address, newExecutor);

        expect(await parameterRegistry.executor()).to.equal(newExecutor);
      });

      it("Should revert if non-admin tries to update", async function () {
        await expect(parameterRegistry.connect(otherUser).setExecutor(admin.address))
          .to.be.revertedWith("Only admin can call this function");
      });

      it("Should revert if new executor is zero address", async function () {
        await expect(parameterRegistry.setExecutor(ethers.ZeroAddress))
          .to.be.revertedWith("Invalid executor address");
      });
    });

    describe("transferAdmin", function () {
      it("Should allow admin to transfer admin role", async function () {
        await expect(parameterRegistry.transferAdmin(admin.address))
          .to.emit(parameterRegistry, "AdminTransferred")
          .withArgs(owner.address, admin.address);

        expect(await parameterRegistry.admin()).to.equal(admin.address);
      });

      it("Should revert if non-admin tries to transfer", async function () {
        await expect(parameterRegistry.connect(otherUser).transferAdmin(admin.address))
          .to.be.revertedWith("Only admin can call this function");
      });

      it("Should revert if new admin is zero address", async function () {
        await expect(parameterRegistry.transferAdmin(ethers.ZeroAddress))
          .to.be.revertedWith("Invalid new admin address");
      });
    });
  });

  // ============ View Functions Tests ============
  describe("View Functions", function () {
    let paramId;

    beforeEach(async function () {
      paramId = generateParameterId("testParam", CATEGORY_EXECUTION);
      const initialValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [100]);

      await parameterRegistry.registerParameter(
        paramId,
        "testParam",
        LEVEL_APPLICATION,
        CATEGORY_EXECUTION,
        initialValue
      );

      await govToken.mint(proposer.address, ethers.parseEther("10"));
      await govToken.mint(voter1.address, ethers.parseEther("100"));
    });

    it("Should return correct threshold for each level", async function () {
      expect(await parameterRegistry.getThresholdForLevel(LEVEL_APPLICATION)).to.equal(APPLICATION_THRESHOLD);
      expect(await parameterRegistry.getThresholdForLevel(LEVEL_SYSTEM)).to.equal(SYSTEM_THRESHOLD);
      expect(await parameterRegistry.getThresholdForLevel(LEVEL_INFRASTRUCTURE)).to.equal(INFRASTRUCTURE_THRESHOLD);
    });

    it("Should return parameter count", async function () {
      expect(await parameterRegistry.getParameterCount()).to.equal(1);
    });

    it("Should track proposal history for parameter", async function () {
      const newValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [200]);

      await parameterRegistry.connect(proposer).proposeParameterChange(paramId, newValue, "Proposal 1");
      await parameterRegistry.connect(proposer).proposeParameterChange(paramId, newValue, "Proposal 2");

      const history = await parameterRegistry.getParameterProposalHistory(paramId);
      expect(history.length).to.equal(2);
      expect(history[0]).to.equal(1n);
      expect(history[1]).to.equal(2n);
    });

    it("Should check if address has voted", async function () {
      const newValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [200]);
      await parameterRegistry.connect(proposer).proposeParameterChange(paramId, newValue, "Test");

      await time.increase(VOTING_DELAY + 1);
      await parameterRegistry.connect(voter1).vote(1, true);

      expect(await parameterRegistry.hasVoted(1, voter1.address)).to.equal(true);
      expect(await parameterRegistry.hasVoted(1, voter2.address)).to.equal(false);
    });

    it("Should return correct voting results", async function () {
      const newValue = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [200]);
      await parameterRegistry.connect(proposer).proposeParameterChange(paramId, newValue, "Test");

      await time.increase(VOTING_DELAY + 1);
      await parameterRegistry.connect(voter1).vote(1, true);

      const results = await parameterRegistry.getVotingResults(1);
      expect(results.forVotes).to.equal(ethers.parseEther("100"));
      expect(results.againstVotes).to.equal(0);
      expect(results.totalVotes).to.equal(ethers.parseEther("100"));
      expect(results.forPercentage).to.equal(10000); // 100%
      expect(results.requiredThreshold).to.equal(APPLICATION_THRESHOLD);
      expect(results.isPassing).to.equal(true);
    });
  });

  // ============ Helper Functions Tests ============
  describe("Helper Functions", function () {
    it("Should generate correct parameter ID", async function () {
      const generatedId = await parameterRegistry.generateParameterId("testParam", CATEGORY_EXECUTION);
      const expectedId = generateParameterId("testParam", CATEGORY_EXECUTION);
      expect(generatedId).to.equal(expectedId);
    });

    it("Should encode and decode uint256 correctly", async function () {
      const value = 12345n;
      const encoded = await parameterRegistry.encodeUint256(value);
      const decoded = await parameterRegistry.decodeUint256(encoded);
      expect(decoded).to.equal(value);
    });

    it("Should encode and decode string correctly", async function () {
      const value = "Hello World";
      const encoded = await parameterRegistry.encodeString(value);
      const decoded = await parameterRegistry.decodeString(encoded);
      expect(decoded).to.equal(value);
    });

    it("Should encode and decode address correctly", async function () {
      const value = owner.address;
      const encoded = await parameterRegistry.encodeAddress(value);
      const decoded = await parameterRegistry.decodeAddress(encoded);
      expect(decoded).to.equal(value);
    });

    it("Should encode and decode bool correctly", async function () {
      const encoded1 = await parameterRegistry.encodeBool(true);
      const decoded1 = await parameterRegistry.decodeBool(encoded1);
      expect(decoded1).to.equal(true);

      const encoded2 = await parameterRegistry.encodeBool(false);
      const decoded2 = await parameterRegistry.decodeBool(encoded2);
      expect(decoded2).to.equal(false);
    });
  });
});
