const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Treasury", function () {
  let Treasury;
  let treasury;
  let MockERC20;
  let govToken;
  let punkToken;
  let usdtToken;
  let owner;
  let admin;
  let proposer;
  let voter1;
  let voter2;
  let voter3;
  let recipient;
  let otherUser;

  // Constants
  const VOTING_DELAY = 24 * 60 * 60; // 1 day in seconds
  const VOTING_PERIOD = 3 * 24 * 60 * 60; // 3 days in seconds
  const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  beforeEach(async function () {
    [owner, admin, proposer, voter1, voter2, voter3, recipient, otherUser] = await ethers.getSigners();

    // Deploy Mock ERC20 Tokens
    MockERC20 = await ethers.getContractFactory("MockERC20");
    
    govToken = await MockERC20.deploy("Governance Token", "GOV");
    await govToken.waitForDeployment();
    
    punkToken = await MockERC20.deploy("Punk Token", "PUNK");
    await punkToken.waitForDeployment();
    
    usdtToken = await MockERC20.deploy("Tether USD", "USDT");
    await usdtToken.waitForDeployment();

    // Deploy Treasury
    Treasury = await ethers.getContractFactory("Treasury");
    treasury = await Treasury.deploy(await govToken.getAddress());
    await treasury.waitForDeployment();
  });

  // ============ Deployment Tests ============
  describe("Deployment", function () {
    it("Should set the correct governance token address", async function () {
      expect(await treasury.govToken()).to.equal(await govToken.getAddress());
    });

    it("Should set deployer as admin", async function () {
      expect(await treasury.admin()).to.equal(owner.address);
    });

    it("Should automatically admit native token (PUNK)", async function () {
      expect(await treasury.isAssetAdmitted(NATIVE_TOKEN)).to.equal(true);
      
      const admittedAssets = await treasury.getAdmittedAssets();
      expect(admittedAssets).to.include(NATIVE_TOKEN);
    });

    it("Should emit AssetAdmitted event for native token", async function () {
      // We need to check the deployment transaction
      const treasuryNew = await Treasury.deploy(await govToken.getAddress());
      await expect(treasuryNew.deploymentTransaction())
        .to.emit(treasuryNew, "AssetAdmitted")
        .withArgs(NATIVE_TOKEN, "PUNK", 18);
    });

    it("Should revert if governance token address is zero", async function () {
      await expect(Treasury.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid Governance token address");
    });
  });

  // ============ Asset Management Tests ============
  describe("Asset Management", function () {
    describe("admitAsset", function () {
      it("Should allow admin to admit a new ERC20 token", async function () {
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.admitAsset(punkAddress, "PUNK", 18))
          .to.emit(treasury, "AssetAdmitted")
          .withArgs(punkAddress, "PUNK", 18);

        expect(await treasury.isAssetAdmitted(punkAddress)).to.equal(true);
      });

      it("Should add asset to admittedAssets array", async function () {
        const punkAddress = await punkToken.getAddress();
        await treasury.admitAsset(punkAddress, "PUNK", 18);

        const admittedAssets = await treasury.getAdmittedAssets();
        expect(admittedAssets).to.include(punkAddress);
      });

      it("Should store correct asset info", async function () {
        const punkAddress = await punkToken.getAddress();
        await treasury.admitAsset(punkAddress, "PUNK", 18);

        const assetInfo = await treasury.assets(punkAddress);
        expect(assetInfo.isAdmitted).to.equal(true);
        expect(assetInfo.symbol).to.equal("PUNK");
        expect(assetInfo.decimals).to.equal(18);
        expect(assetInfo.totalDeposited).to.equal(0);
        expect(assetInfo.totalWithdrawn).to.equal(0);
      });

      it("Should revert if non-admin tries to admit asset", async function () {
        const punkAddress = await punkToken.getAddress();
        await expect(treasury.connect(otherUser).admitAsset(punkAddress, "PUNK", 18))
          .to.be.revertedWith("Only admin can call this function");
      });

      it("Should revert if token address is zero", async function () {
        await expect(treasury.admitAsset(ethers.ZeroAddress, "ZERO", 18))
          .to.be.revertedWith("Invalid token address");
      });

      it("Should revert if trying to admit NATIVE_TOKEN constant", async function () {
        await expect(treasury.admitAsset(NATIVE_TOKEN, "PUNK", 18))
          .to.be.revertedWith("Use NATIVE_TOKEN constant for native token");
      });

      it("Should revert if asset is already admitted", async function () {
        const punkAddress = await punkToken.getAddress();
        await treasury.admitAsset(punkAddress, "PUNK", 18);
        
        await expect(treasury.admitAsset(punkAddress, "PUNK", 18))
          .to.be.revertedWith("Asset already admitted");
      });
    });

    describe("removeAsset", function () {
      beforeEach(async function () {
        const punkAddress = await punkToken.getAddress();
        await treasury.admitAsset(punkAddress, "PUNK", 18);
      });

      it("Should allow admin to remove an asset", async function () {
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.removeAsset(punkAddress))
          .to.emit(treasury, "AssetRemoved")
          .withArgs(punkAddress);

        expect(await treasury.isAssetAdmitted(punkAddress)).to.equal(false);
      });

      it("Should remove asset from admittedAssets array", async function () {
        const punkAddress = await punkToken.getAddress();
        await treasury.removeAsset(punkAddress);

        const admittedAssets = await treasury.getAdmittedAssets();
        expect(admittedAssets).to.not.include(punkAddress);
      });

      it("Should revert if non-admin tries to remove asset", async function () {
        const punkAddress = await punkToken.getAddress();
        await expect(treasury.connect(otherUser).removeAsset(punkAddress))
          .to.be.revertedWith("Only admin can call this function");
      });

      it("Should revert if asset is not admitted", async function () {
        const usdtAddress = await usdtToken.getAddress();
        await expect(treasury.removeAsset(usdtAddress))
          .to.be.revertedWith("Asset not admitted");
      });

      it("Should revert if trying to remove native token", async function () {
        await expect(treasury.removeAsset(NATIVE_TOKEN))
          .to.be.revertedWith("Cannot remove native token (PUNK)");
      });
    });

    describe("transferAdmin", function () {
      it("Should allow admin to transfer admin role", async function () {
        await expect(treasury.transferAdmin(admin.address))
          .to.emit(treasury, "AdminTransferred")
          .withArgs(owner.address, admin.address);

        expect(await treasury.admin()).to.equal(admin.address);
      });

      it("Should revert if non-admin tries to transfer admin", async function () {
        await expect(treasury.connect(otherUser).transferAdmin(admin.address))
          .to.be.revertedWith("Only admin can call this function");
      });

      it("Should revert if new admin address is zero", async function () {
        await expect(treasury.transferAdmin(ethers.ZeroAddress))
          .to.be.revertedWith("Invalid new admin address");
      });

      it("New admin should be able to admit assets", async function () {
        await treasury.transferAdmin(admin.address);
        
        const punkAddress = await punkToken.getAddress();
        await expect(treasury.connect(admin).admitAsset(punkAddress, "PUNK", 18))
          .to.emit(treasury, "AssetAdmitted");
      });
    });
  });

  // ============ Deposit Tests ============
  describe("Deposit Functions", function () {
    describe("depositPunk (PUNK Native Token)", function () {
      it("Should allow depositing PUNK with reason", async function () {
        const amount = ethers.parseEther("1");
        
        await expect(treasury.depositPunk("Slashing penalty", { value: amount }))
          .to.emit(treasury, "NativeDeposit")
          .withArgs(owner.address, amount, "Slashing penalty");

        expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(amount);
      });

      it("Should update totalDeposited for native token", async function () {
        const amount = ethers.parseEther("5");
        await treasury.depositPunk("Test deposit", { value: amount });

        const assetInfo = await treasury.assets(NATIVE_TOKEN);
        expect(assetInfo.totalDeposited).to.equal(amount);
      });

      it("Should revert if amount is zero", async function () {
        await expect(treasury.depositPunk("Zero deposit", { value: 0 }))
          .to.be.revertedWith("Amount must be greater than 0");
      });
    });

    describe("receive() - Direct PUNK transfer", function () {
      it("Should accept direct PUNK transfers", async function () {
        const amount = ethers.parseEther("2");
        
        await expect(owner.sendTransaction({
          to: await treasury.getAddress(),
          value: amount
        })).to.emit(treasury, "NativeDeposit")
          .withArgs(owner.address, amount, "Direct PUNK transfer");
      });

      it("Should update totalDeposited on direct transfer", async function () {
        const amount = ethers.parseEther("3");
        await owner.sendTransaction({
          to: await treasury.getAddress(),
          value: amount
        });

        const assetInfo = await treasury.assets(NATIVE_TOKEN);
        expect(assetInfo.totalDeposited).to.equal(amount);
      });
    });

    describe("deposit (ERC20)", function () {
      beforeEach(async function () {
        // Admit PUNK token
        await treasury.admitAsset(await punkToken.getAddress(), "PUNK", 18);
        // Mint tokens to owner
        await punkToken.mint(owner.address, ethers.parseEther("1000"));
      });

      it("Should allow depositing ERC20 tokens", async function () {
        const amount = ethers.parseEther("100");
        const punkAddress = await punkToken.getAddress();
        
        await punkToken.approve(await treasury.getAddress(), amount);
        
        await expect(treasury.deposit(punkAddress, amount, "Slashing funds"))
          .to.emit(treasury, "Deposit")
          .withArgs(punkAddress, owner.address, amount, "Slashing funds");

        expect(await punkToken.balanceOf(await treasury.getAddress())).to.equal(amount);
      });

      it("Should update totalDeposited for ERC20 token", async function () {
        const amount = ethers.parseEther("200");
        const punkAddress = await punkToken.getAddress();
        
        await punkToken.approve(await treasury.getAddress(), amount);
        await treasury.deposit(punkAddress, amount, "Test");

        const assetInfo = await treasury.assets(punkAddress);
        expect(assetInfo.totalDeposited).to.equal(amount);
      });

      it("Should revert if token is not admitted", async function () {
        const amount = ethers.parseEther("100");
        const usdtAddress = await usdtToken.getAddress();
        
        await usdtToken.mint(owner.address, amount);
        await usdtToken.approve(await treasury.getAddress(), amount);
        
        await expect(treasury.deposit(usdtAddress, amount, "Test"))
          .to.be.revertedWith("Asset not admitted for circulation");
      });

      it("Should revert if trying to deposit NATIVE_TOKEN via deposit()", async function () {
        await expect(treasury.deposit(NATIVE_TOKEN, ethers.parseEther("1"), "Test"))
          .to.be.revertedWith("Use depositPunk for PUNK native token");
      });

      it("Should revert if amount is zero", async function () {
        const punkAddress = await punkToken.getAddress();
        await expect(treasury.deposit(punkAddress, 0, "Zero"))
          .to.be.revertedWith("Amount must be greater than 0");
      });

      it("Should revert if not approved", async function () {
        const amount = ethers.parseEther("100");
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.deposit(punkAddress, amount, "No approval"))
          .to.be.reverted;
      });
    });
  });

  // ============ Balance Query Tests ============
  describe("Balance Queries", function () {
    beforeEach(async function () {
      // Admit and deposit PUNK
      await treasury.admitAsset(await punkToken.getAddress(), "PUNK", 18);
      await punkToken.mint(owner.address, ethers.parseEther("500"));
      await punkToken.approve(await treasury.getAddress(), ethers.parseEther("500"));
      await treasury.deposit(await punkToken.getAddress(), ethers.parseEther("500"), "Test");
      
      // Deposit PUNK native token
      await treasury.depositPunk("PUNK deposit", { value: ethers.parseEther("10") });
    });

    it("Should return correct balance for native token", async function () {
      const balance = await treasury.getAssetBalance(NATIVE_TOKEN);
      expect(balance).to.equal(ethers.parseEther("10"));
    });

    it("Should return correct balance for ERC20 token", async function () {
      const balance = await treasury.getAssetBalance(await punkToken.getAddress());
      expect(balance).to.equal(ethers.parseEther("500"));
    });

    it("Should return all asset balances", async function () {
      const [tokens, balances] = await treasury.getAllAssetBalances();
      
      expect(tokens.length).to.equal(2); // PUNK native + PUNK ERC20
      
      const punkNativeIndex = tokens.indexOf(NATIVE_TOKEN);
      const punkErc20Index = tokens.indexOf(await punkToken.getAddress());
      
      expect(balances[punkNativeIndex]).to.equal(ethers.parseEther("10"));
      expect(balances[punkErc20Index]).to.equal(ethers.parseEther("500"));
    });

    it("Should return correct asset stats", async function () {
      const punkAddress = await punkToken.getAddress();
      const stats = await treasury.getAssetStats(punkAddress);
      
      expect(stats.isAdmitted).to.equal(true);
      expect(stats.symbol).to.equal("PUNK");
      expect(stats.decimals).to.equal(18);
      expect(stats.balance).to.equal(ethers.parseEther("500"));
      expect(stats.totalDeposited).to.equal(ethers.parseEther("500"));
      expect(stats.totalWithdrawn).to.equal(0);
    });
  });

  // ============ Proposal Tests ============
  describe("Proposal Functions", function () {
    beforeEach(async function () {
      // Setup: Admit and fund treasury
      await treasury.admitAsset(await punkToken.getAddress(), "PUNK", 18);
      await punkToken.mint(owner.address, ethers.parseEther("1000"));
      await punkToken.approve(await treasury.getAddress(), ethers.parseEther("1000"));
      await treasury.deposit(await punkToken.getAddress(), ethers.parseEther("1000"), "Funding");
      
      // Deposit PUNK native token
      await treasury.depositPunk("PUNK funding", { value: ethers.parseEther("100") });
      
      // Distribute governance tokens
      await govToken.mint(proposer.address, ethers.parseEther("10"));
      await govToken.mint(voter1.address, ethers.parseEther("100"));
      await govToken.mint(voter2.address, ethers.parseEther("50"));
      await govToken.mint(voter3.address, ethers.parseEther("40"));
    });

    describe("propose", function () {
      it("Should allow creating a proposal for ERC20 token", async function () {
        const amount = ethers.parseEther("100");
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.connect(proposer).propose(punkAddress, recipient.address, amount, "Dev grant"))
          .to.emit(treasury, "ProposalCreated")
          .withArgs(1, proposer.address, punkAddress, recipient.address, amount, "Dev grant");

        expect(await treasury.proposalCount()).to.equal(1);
      });

      it("Should allow creating a proposal for native token (PUNK)", async function () {
        const amount = ethers.parseEther("5");
        
        await expect(treasury.connect(proposer).propose(NATIVE_TOKEN, recipient.address, amount, "PUNK grant"))
          .to.emit(treasury, "ProposalCreated")
          .withArgs(1, proposer.address, NATIVE_TOKEN, recipient.address, amount, "PUNK grant");
      });

      it("Should store correct proposal data", async function () {
        const amount = ethers.parseEther("100");
        const punkAddress = await punkToken.getAddress();
        
        await treasury.connect(proposer).propose(punkAddress, recipient.address, amount, "Test proposal");
        
        const proposal = await treasury.getProposal(1);
        expect(proposal.proposer).to.equal(proposer.address);
        expect(proposal.token).to.equal(punkAddress);
        expect(proposal.target).to.equal(recipient.address);
        expect(proposal.amount).to.equal(amount);
        expect(proposal.description).to.equal("Test proposal");
        expect(proposal.executed).to.equal(false);
        expect(proposal.canceled).to.equal(false);
      });

      it("Should revert if proposer has no governance tokens", async function () {
        const amount = ethers.parseEther("100");
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.connect(otherUser).propose(punkAddress, recipient.address, amount, "No tokens"))
          .to.be.revertedWith("Must hold governance tokens to propose");
      });

      it("Should revert if asset is not admitted", async function () {
        const amount = ethers.parseEther("100");
        const usdtAddress = await usdtToken.getAddress();
        
        await expect(treasury.connect(proposer).propose(usdtAddress, recipient.address, amount, "Invalid"))
          .to.be.revertedWith("Asset not admitted for circulation");
      });

      it("Should revert if target address is zero", async function () {
        const amount = ethers.parseEther("100");
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.connect(proposer).propose(punkAddress, ethers.ZeroAddress, amount, "Zero target"))
          .to.be.revertedWith("Invalid target address");
      });

      it("Should revert if amount is zero", async function () {
        const punkAddress = await punkToken.getAddress();
        
        await expect(treasury.connect(proposer).propose(punkAddress, recipient.address, 0, "Zero amount"))
          .to.be.revertedWith("Amount must be greater than 0");
      });
    });

    describe("vote", function () {
      beforeEach(async function () {
        // Create a proposal
        await treasury.connect(proposer).propose(
          await punkToken.getAddress(),
          recipient.address,
          ethers.parseEther("100"),
          "Test proposal"
        );
      });

      it("Should not allow voting before start time", async function () {
        await expect(treasury.connect(voter1).vote(1, true))
          .to.be.revertedWith("Voting has not started");
      });

      it("Should allow voting after start time", async function () {
        await time.increase(VOTING_DELAY + 1);
        
        await expect(treasury.connect(voter1).vote(1, true))
          .to.emit(treasury, "VoteCast")
          .withArgs(voter1.address, 1, true, ethers.parseEther("100"));
      });

      it("Should record votes correctly", async function () {
        await time.increase(VOTING_DELAY + 1);
        
        await treasury.connect(voter1).vote(1, true);  // For
        await treasury.connect(voter2).vote(1, false); // Against
        
        const proposal = await treasury.getProposal(1);
        expect(proposal.forVotes).to.equal(ethers.parseEther("100"));
        expect(proposal.againstVotes).to.equal(ethers.parseEther("50"));
      });

      it("Should not allow voting twice", async function () {
        await time.increase(VOTING_DELAY + 1);
        
        await treasury.connect(voter1).vote(1, true);
        
        await expect(treasury.connect(voter1).vote(1, false))
          .to.be.revertedWith("Already voted");
      });

      it("Should not allow voting after end time", async function () {
        await time.increase(VOTING_DELAY + VOTING_PERIOD + 1);
        
        await expect(treasury.connect(voter1).vote(1, true))
          .to.be.revertedWith("Voting has ended");
      });

      it("Should not allow voting without governance tokens", async function () {
        await time.increase(VOTING_DELAY + 1);
        
        await expect(treasury.connect(otherUser).vote(1, true))
          .to.be.revertedWith("No voting weight");
      });
    });

    describe("execute", function () {
      beforeEach(async function () {
        // Create a proposal
        await treasury.connect(proposer).propose(
          await punkToken.getAddress(),
          recipient.address,
          ethers.parseEther("100"),
          "Test proposal"
        );
        
        // Advance to voting period and vote
        await time.increase(VOTING_DELAY + 1);
        await treasury.connect(voter1).vote(1, true);
        await treasury.connect(voter2).vote(1, true);
      });

      it("Should not allow execution before voting ends", async function () {
        await expect(treasury.execute(1))
          .to.be.revertedWith("Voting period not ended");
      });

      it("Should execute successful ERC20 proposal", async function () {
        await time.increase(VOTING_PERIOD + 1);
        
        const recipientBalanceBefore = await punkToken.balanceOf(recipient.address);
        
        await expect(treasury.execute(1))
          .to.emit(treasury, "ProposalExecuted")
          .withArgs(1);
        
        const recipientBalanceAfter = await punkToken.balanceOf(recipient.address);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(ethers.parseEther("100"));
      });

      it("Should execute successful ETH proposal", async function () {
        // Create ETH proposal
        await treasury.connect(proposer).propose(
          NATIVE_TOKEN,
          recipient.address,
          ethers.parseEther("5"),
          "ETH grant"
        );
        
        await time.increase(VOTING_DELAY + 1);
        await treasury.connect(voter1).vote(2, true);
        await treasury.connect(voter2).vote(2, true);
        await time.increase(VOTING_PERIOD + 1);
        
        const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
        
        await treasury.execute(2);
        
        const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
        expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(ethers.parseEther("5"));
      });

      it("Should update totalWithdrawn after execution", async function () {
        await time.increase(VOTING_PERIOD + 1);
        await treasury.execute(1);
        
        const stats = await treasury.getAssetStats(await punkToken.getAddress());
        expect(stats.totalWithdrawn).to.equal(ethers.parseEther("100"));
      });

      it("Should fail if quorum not reached", async function () {
        // Create new proposal
        await treasury.connect(proposer).propose(
          await punkToken.getAddress(),
          recipient.address,
          ethers.parseEther("50"),
          "Low quorum proposal"
        );
        
        await time.increase(VOTING_DELAY + 1);
        // Only proposer votes (10 tokens)
        // Total supply is 200 (proposer 10 + voter1 100 + voter2 50 + voter3 40)
        // Quorum is 4% of 200 = 8 tokens
        // We need less than 8 tokens voting, but proposer has 10
        // So we need a new user with fewer tokens
        
        // Don't vote at all - skip to end
        await time.increase(VOTING_PERIOD + 1);
        
        await expect(treasury.execute(2))
          .to.be.revertedWith("Quorum not reached");
      });

      it("Should fail if more against votes", async function () {
        // Create new proposal
        await treasury.connect(proposer).propose(
          await punkToken.getAddress(),
          recipient.address,
          ethers.parseEther("50"),
          "Rejected proposal"
        );
        
        await time.increase(VOTING_DELAY + 1);
        await treasury.connect(voter1).vote(2, false); // 100 against
        await treasury.connect(voter2).vote(2, true);  // 50 for
        await time.increase(VOTING_PERIOD + 1);
        
        await expect(treasury.execute(2))
          .to.be.revertedWith("Proposal failed");
      });

      it("Should fail if insufficient treasury balance", async function () {
        // Create proposal for more than treasury has
        await treasury.connect(proposer).propose(
          await punkToken.getAddress(),
          recipient.address,
          ethers.parseEther("5000"), // Treasury only has 1000
          "Too much"
        );
        
        await time.increase(VOTING_DELAY + 1);
        await treasury.connect(voter1).vote(2, true);
        await treasury.connect(voter2).vote(2, true);
        await time.increase(VOTING_PERIOD + 1);
        
        await expect(treasury.execute(2))
          .to.be.revertedWith("Insufficient Treasury balance");
      });

      it("Should fail if asset is removed after proposal creation", async function () {
        // Remove the asset
        await treasury.removeAsset(await punkToken.getAddress());
        
        await time.increase(VOTING_PERIOD + 1);
        
        await expect(treasury.execute(1))
          .to.be.revertedWith("Asset no longer admitted");
      });

      it("Should not allow executing twice", async function () {
        await time.increase(VOTING_PERIOD + 1);
        await treasury.execute(1);
        
        await expect(treasury.execute(1))
          .to.be.revertedWith("Already executed");
      });
    });

    describe("cancel", function () {
      beforeEach(async function () {
        await treasury.connect(proposer).propose(
          await punkToken.getAddress(),
          recipient.address,
          ethers.parseEther("100"),
          "Cancelable proposal"
        );
      });

      it("Should allow proposer to cancel", async function () {
        await expect(treasury.connect(proposer).cancel(1))
          .to.emit(treasury, "ProposalCanceled")
          .withArgs(1);

        const proposal = await treasury.getProposal(1);
        expect(proposal.canceled).to.equal(true);
      });

      it("Should not allow non-proposer to cancel", async function () {
        await expect(treasury.connect(voter1).cancel(1))
          .to.be.revertedWith("Only proposer can cancel");
      });

      it("Should not allow canceling after voting ends", async function () {
        await time.increase(VOTING_DELAY + VOTING_PERIOD + 1);
        
        await expect(treasury.connect(proposer).cancel(1))
          .to.be.revertedWith("Voting ended");
      });

      it("Should not allow voting on canceled proposal", async function () {
        await treasury.connect(proposer).cancel(1);
        await time.increase(VOTING_DELAY + 1);
        
        await expect(treasury.connect(voter1).vote(1, true))
          .to.be.revertedWith("Proposal canceled");
      });

      it("Should not allow executing canceled proposal", async function () {
        await time.increase(VOTING_DELAY + 1);
        await treasury.connect(voter1).vote(1, true);
        await treasury.connect(proposer).cancel(1);
        await time.increase(VOTING_PERIOD + 1);
        
        await expect(treasury.execute(1))
          .to.be.revertedWith("Canceled");
      });
    });
  });

  // ============ Multiple Assets Tests ============
  describe("Multiple Assets", function () {
    beforeEach(async function () {
      // Admit multiple tokens
      await treasury.admitAsset(await punkToken.getAddress(), "PUNK", 18);
      await treasury.admitAsset(await usdtToken.getAddress(), "USDT", 6);
      
      // Fund treasury
      await punkToken.mint(owner.address, ethers.parseEther("1000"));
      await punkToken.approve(await treasury.getAddress(), ethers.parseEther("1000"));
      await treasury.deposit(await punkToken.getAddress(), ethers.parseEther("1000"), "PUNK funding");
      
      await usdtToken.mint(owner.address, ethers.parseUnits("10000", 6));
      await usdtToken.approve(await treasury.getAddress(), ethers.parseUnits("10000", 6));
      await treasury.deposit(await usdtToken.getAddress(), ethers.parseUnits("10000", 6), "USDT funding");
      
      await treasury.depositPunk("PUNK native funding", { value: ethers.parseEther("50") });
      
      // Setup governance
      await govToken.mint(proposer.address, ethers.parseEther("10"));
      await govToken.mint(voter1.address, ethers.parseEther("100"));
    });

    it("Should handle multiple admitted assets correctly", async function () {
      const admittedAssets = await treasury.getAdmittedAssets();
      expect(admittedAssets.length).to.equal(3); // ETH, PUNK, USDT
    });

    it("Should create proposals for different asset types", async function () {
      // PUNK proposal
      await treasury.connect(proposer).propose(
        await punkToken.getAddress(),
        recipient.address,
        ethers.parseEther("100"),
        "PUNK grant"
      );
      
      // USDT proposal
      await treasury.connect(proposer).propose(
        await usdtToken.getAddress(),
        recipient.address,
        ethers.parseUnits("500", 6),
        "USDT grant"
      );
      
      // ETH proposal
      await treasury.connect(proposer).propose(
        NATIVE_TOKEN,
        recipient.address,
        ethers.parseEther("1"),
        "ETH grant"
      );
      
      expect(await treasury.proposalCount()).to.equal(3);
    });

    it("Should execute proposals for different asset types independently", async function () {
      // Create and execute PUNK proposal
      await treasury.connect(proposer).propose(
        await punkToken.getAddress(),
        recipient.address,
        ethers.parseEther("100"),
        "PUNK grant"
      );
      
      await time.increase(VOTING_DELAY + 1);
      await treasury.connect(voter1).vote(1, true);
      await time.increase(VOTING_PERIOD + 1);
      await treasury.execute(1);
      
      // Verify PUNK was transferred
      expect(await punkToken.balanceOf(recipient.address)).to.equal(ethers.parseEther("100"));
      
      // Verify other balances unchanged
      expect(await treasury.getAssetBalance(await usdtToken.getAddress())).to.equal(ethers.parseUnits("10000", 6));
      expect(await treasury.getAssetBalance(NATIVE_TOKEN)).to.equal(ethers.parseEther("50"));
    });
  });

  // ============ Edge Cases ============
  describe("Edge Cases", function () {
    it("Should handle removing and re-admitting same asset", async function () {
      const punkAddress = await punkToken.getAddress();
      
      await treasury.admitAsset(punkAddress, "PUNK", 18);
      await treasury.removeAsset(punkAddress);
      
      // Re-admit with different decimals (edge case)
      await treasury.admitAsset(punkAddress, "PUNK2", 8);
      
      const assetInfo = await treasury.assets(punkAddress);
      expect(assetInfo.symbol).to.equal("PUNK2");
      expect(assetInfo.decimals).to.equal(8);
    });

    it("Should keep funds when asset is removed", async function () {
      const punkAddress = await punkToken.getAddress();
      
      await treasury.admitAsset(punkAddress, "PUNK", 18);
      await punkToken.mint(owner.address, ethers.parseEther("100"));
      await punkToken.approve(await treasury.getAddress(), ethers.parseEther("100"));
      await treasury.deposit(punkAddress, ethers.parseEther("100"), "Test");
      
      await treasury.removeAsset(punkAddress);
      
      // Funds still in treasury
      expect(await punkToken.balanceOf(await treasury.getAddress())).to.equal(ethers.parseEther("100"));
    });

    it("Should handle multiple deposits correctly", async function () {
      const punkAddress = await punkToken.getAddress();
      
      await treasury.admitAsset(punkAddress, "PUNK", 18);
      await punkToken.mint(owner.address, ethers.parseEther("300"));
      await punkToken.approve(await treasury.getAddress(), ethers.parseEther("300"));
      
      await treasury.deposit(punkAddress, ethers.parseEther("100"), "Deposit 1");
      await treasury.deposit(punkAddress, ethers.parseEther("100"), "Deposit 2");
      await treasury.deposit(punkAddress, ethers.parseEther("100"), "Deposit 3");
      
      const stats = await treasury.getAssetStats(punkAddress);
      expect(stats.totalDeposited).to.equal(ethers.parseEther("300"));
      expect(stats.balance).to.equal(ethers.parseEther("300"));
    });
  });
});
