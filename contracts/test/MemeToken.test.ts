import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { MemeToken } from "../typechain-types";

describe("MemeToken", function () {
  async function deployTokenFixture() {
    const [owner, creator, user1, user2, user3] = await ethers.getSigners();

    const MemeToken = await ethers.getContractFactory("MemeToken");
    const token = await MemeToken.deploy(
      creator.address,
      "Test Meme",
      "MEME",
      ethers.parseEther("1000000"),
      "A test meme token",
      "https://example.com/image.png",
      "@testmeme",
      "t.me/testmeme",
      "https://testmeme.com"
    );

    return { token, owner, creator, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("Should set the correct token parameters", async function () {
      const { token } = await loadFixture(deployTokenFixture);
      
      expect(await token.name()).to.equal("Test Meme");
      expect(await token.symbol()).to.equal("MEME");
      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
      expect(await token.description()).to.equal("A test meme token");
      expect(await token.image()).to.equal("https://example.com/image.png");
      expect(await token.twitter()).to.equal("@testmeme");
      expect(await token.telegram()).to.equal("t.me/testmeme");
      expect(await token.website()).to.equal("https://testmeme.com");
    });

    it("Should mint all tokens to the factory (deployer)", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const balance = await token.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseEther("1000000"));
    });

    it("Should set correct initial trading limits", async function () {
      const { token } = await loadFixture(deployTokenFixture);
      
      const totalSupply = await token.totalSupply();
      const expectedLimit = (totalSupply * 2n) / 100n; // 2%
      
      expect(await token.maxWallet()).to.equal(expectedLimit);
      expect(await token.maxTransaction()).to.equal(expectedLimit);
    });

    it("Should whitelist factory and creator", async function () {
      const { token, owner, creator } = await loadFixture(deployTokenFixture);
      
      expect(await token.isWhitelisted(owner.address)).to.be.true;
      expect(await token.isWhitelisted(creator.address)).to.be.true;
    });
  });

  describe("Trading Controls", function () {
    it("Should not allow trading before enabled", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      // Transfer some tokens from factory to user1 (whitelisted transfer)
      await token.connect(owner).transfer(user1.address, ethers.parseEther("100"));
      
      // Try to transfer between regular users
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Trading not enabled");
    });

    it("Should allow trading after enabled", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      // Enable trading
      await token.connect(owner).enableTrading();
      
      // Mine blocks to pass anti-snipe period
      await mine(4);
      
      // Transfer tokens to user1
      await token.connect(owner).transfer(user1.address, ethers.parseEther("100"));
      
      // Now user1 can transfer to user2
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.not.be.reverted;
      
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("10"));
    });

    it("Should enforce max transaction limits", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      await token.connect(owner).enableTrading();
      
      // Mine blocks to pass anti-snipe period
      await mine(4);
      
      // Try to transfer more than max transaction
      const maxTx = await token.maxTransaction();
      const tooMuch = maxTx + ethers.parseEther("1");
      
      await token.connect(owner).transfer(user1.address, tooMuch);
      
      await expect(
        token.connect(user1).transfer(user2.address, tooMuch)
      ).to.be.revertedWith("Exceeds max transaction");
    });

    it("Should enforce max wallet limits", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      await token.connect(owner).enableTrading();
      
      // Mine blocks to pass anti-snipe period
      await mine(4);
      
      const maxWallet = await token.maxWallet();
      
      // Transfer max wallet amount to user2
      await token.connect(owner).transfer(user2.address, maxWallet);
      
      // Transfer some to user1
      await token.connect(owner).transfer(user1.address, ethers.parseEther("100"));
      
      // User1 tries to send to user2 (would exceed max wallet)
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Exceeds max wallet");
    });

    it("Should allow owner to update max limits", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const totalSupply = await token.totalSupply();
      const newMaxWallet = (totalSupply * 5n) / 100n; // 5%
      const newMaxTx = (totalSupply * 3n) / 100n; // 3%
      
      await token.connect(owner).setMaxWallet(newMaxWallet);
      await token.connect(owner).setMaxTransaction(newMaxTx);
      
      expect(await token.maxWallet()).to.equal(newMaxWallet);
      expect(await token.maxTransaction()).to.equal(newMaxTx);
    });

    it("Should not allow limits too low", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const totalSupply = await token.totalSupply();
      const tooLowWallet = totalSupply / 101n; // Less than 1%
      const tooLowTx = totalSupply / 201n; // Less than 0.5%
      
      await expect(
        token.connect(owner).setMaxWallet(tooLowWallet)
      ).to.be.revertedWith("Too low");
      
      await expect(
        token.connect(owner).setMaxTransaction(tooLowTx)
      ).to.be.revertedWith("Too low");
    });
  });

  describe("Anti-Bot Protection", function () {
    it("Should enforce anti-snipe protection", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      // Transfer tokens to user1 before enabling trading
      await token.connect(owner).transfer(user1.address, ethers.parseEther("100"));
      
      // Enable trading
      await token.connect(owner).enableTrading();
      
      // During anti-snipe blocks, only whitelisted can receive
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Anti-snipe protection");
      
      // Mine some blocks to pass anti-snipe period
      await mine(4);
      
      // Now transfer should work
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.not.be.reverted;
    });

    it("Should allow blacklisting addresses", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      await token.connect(owner).enableTrading();
      await mine(4); // Pass anti-snipe period
      
      // Blacklist user2
      await token.connect(owner).updateBlacklist(user2.address, true);
      
      // Transfer to user1
      await token.connect(owner).transfer(user1.address, ethers.parseEther("100"));
      
      // User1 cannot transfer to blacklisted user2
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10"))
      ).to.be.revertedWith("Blacklisted");
    });

    it("Should bypass restrictions for whitelisted addresses", async function () {
      const { token, owner, user1, user2 } = await loadFixture(deployTokenFixture);
      
      // Whitelist user1
      await token.connect(owner).updateWhitelist(user1.address, true);
      
      // User1 can receive tokens even before trading is enabled
      await expect(
        token.connect(owner).transfer(user1.address, ethers.parseEther("100000"))
      ).to.not.be.reverted;
      
      // User1 can send without restrictions
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("50000"))
      ).to.not.be.reverted;
    });
  });

  describe("Metadata Management", function () {
    it("Should allow owner to update description", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const newDescription = "Updated description";
      await token.connect(owner).updateDescription(newDescription);
      
      expect(await token.description()).to.equal(newDescription);
    });

    it("Should allow owner to update image", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const newImage = "https://newimage.com/image.png";
      await token.connect(owner).updateImage(newImage);
      
      expect(await token.image()).to.equal(newImage);
    });

    it("Should allow owner to update socials", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      await token.connect(owner).updateSocials(
        "@newtwitter",
        "t.me/newtelegram",
        "https://newwebsite.com"
      );
      
      expect(await token.twitter()).to.equal("@newtwitter");
      expect(await token.telegram()).to.equal("t.me/newtelegram");
      expect(await token.website()).to.equal("https://newwebsite.com");
    });

    it("Should emit events on metadata updates", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      await expect(token.connect(owner).updateDescription("New desc"))
        .to.emit(token, "MetadataUpdated")
        .withArgs("description", "New desc");
      
      await expect(token.connect(owner).updateImage("new.png"))
        .to.emit(token, "MetadataUpdated")
        .withArgs("image", "new.png");
    });

    it("Should only allow owner to update metadata", async function () {
      const { token, user1 } = await loadFixture(deployTokenFixture);
      
      await expect(
        token.connect(user1).updateDescription("Hack")
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Ownership", function () {
    it("Should allow owner to renounce ownership", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      await token.connect(owner).renounceOwnership();
      
      expect(await token.owner()).to.equal(ethers.ZeroAddress);
    });

    it("Should remove limits when renouncing ownership", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const totalSupply = await token.totalSupply();
      
      await token.connect(owner).renounceOwnership();
      
      expect(await token.maxWallet()).to.equal(totalSupply);
      expect(await token.maxTransaction()).to.equal(totalSupply);
    });

    it("Should not allow functions after renouncing", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      await token.connect(owner).renounceOwnership();
      
      await expect(
        token.connect(owner).updateDescription("Test")
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return complete metadata", async function () {
      const { token, owner } = await loadFixture(deployTokenFixture);
      
      const metadata = await token.getMetadata();
      
      expect(metadata[0]).to.equal("A test meme token"); // description
      expect(metadata[1]).to.equal("https://example.com/image.png"); // image
      expect(metadata[2]).to.equal("@testmeme"); // twitter
      expect(metadata[3]).to.equal("t.me/testmeme"); // telegram
      expect(metadata[4]).to.equal("https://testmeme.com"); // website
      expect(metadata[8]).to.equal(owner.address); // owner
    });
  });
});