const { ethers } = require("hardhat");

/**
 * ExecutionAdapter wraps the Treasury.sol contract for execution-layer callers
 * (slashing module, proposal bot, governance UI, etc.). It exposes explicit
 * helpers for deposit, propose, vote, and execute flows so integration code can
 * stay concise and audited.
 */
class ExecutionAdapter {
  /**
   * @param {string} treasuryAddress System-level Treasury contract address
   * @param {string} punkTokenAddress ERC-20 PUNK token address (for allowance checks)
   */
  constructor(treasuryAddress, punkTokenAddress) {
    if (!ethers.isAddress(treasuryAddress)) {
      throw new Error("Invalid treasury address");
    }
    if (!ethers.isAddress(punkTokenAddress)) {
      throw new Error("Invalid punk token address");
    }
    this.treasuryAddress = treasuryAddress;
    this.punkTokenAddress = punkTokenAddress;
  }

  async init() {
    const treasuryFactory = await ethers.getContractFactory("Treasury");
    this.treasury = treasuryFactory.attach(this.treasuryAddress);

    const punkFactory = await ethers.getContractFactory("MockERC20");
    this.punkToken = punkFactory.attach(this.punkTokenAddress);
  }

  /**
   * Deposits PUNK into the Treasury (requires prior ERC-20 approval).
   * @param {ethers.Signer} depositor signer holding PUNK tokens
   * @param {ethers.BigNumberish} amount amount to deposit
   * @param {string} reason memo (e.g. "Slashing: validator 0x123")
   */
  async depositPunk(depositor, amount, reason) {
    const treasury = this.treasury.connect(depositor);
    const punk = this.punkToken.connect(depositor);
    const allowance = await punk.allowance(await depositor.getAddress(), this.treasuryAddress);
    if (allowance < amount) {
      const approveTx = await punk.approve(this.treasuryAddress, amount);
      await approveTx.wait();
    }
    const tx = await treasury.deposit(amount, reason);
    return tx.wait();
  }

  /**
   * Submits a proposal to spend PUNK to a target address.
   */
  async proposeSpend(proposer, targetAddress, amount, description) {
    const tx = await this.treasury.connect(proposer).propose(targetAddress, amount, description);
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return this.treasury.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .find((decoded) => decoded && decoded.name === "ProposalCreated");
    return event ? event.args.id : undefined;
  }

  /**
   * Casts a vote for a proposal.
   */
  vote(signer, proposalId, support) {
    return this.treasury.connect(signer).vote(proposalId, support);
  }

  /**
   * Executes a proposal that satisfied quorum + majority.
   */
  execute(signer, proposalId) {
    return this.treasury.connect(signer).execute(proposalId);
  }
}

module.exports = { ExecutionAdapter };
