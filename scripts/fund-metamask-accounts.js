const { ethers } = require("hardhat");

async function main() {
  // 使用 0xBeDb55Dac85cdc6a8276215199f96030902B1Dd0 作为发送方
  const [funder] = await ethers.getSigners();
  const recipients = [
    "0xdBF8968e3F8DcA31A6De05b2DfFcb1083C8Ca36B",
    "0x05D888e9A58d8e9444c7Abf3C6653AA02313fD15",
    "0x14429Db1dAFDcee8AFA5B867B3b089d025Ee8dda",
    "0x6A5275F5B57090CEfC471074d331A9E2c38991e9",
    "0x697DF7F02Be0cc48D8bc3D47b19De8d4738D3d56",
    "0xCFB36bE95D0ADf86a3da7Ae48DE458893f2BFF1D"
  ];

  const amount = ethers.parseEther("10");

  console.log("Funder:", funder.address);
  console.log("Funding", recipients.length, "accounts with", ethers.formatEther(amount), "ETH each");

  for (const addr of recipients) {
    const tx = await funder.sendTransaction({
      to: addr,
      value: amount
    });
    await tx.wait();
    console.log("  ✓ Funded", addr, "tx:", tx.hash);
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Funding failed:", error);
    process.exit(1);
  });
