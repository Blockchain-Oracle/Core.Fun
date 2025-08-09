import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MemeFactory, MemeToken, Staking } from "../typechain-types";

describe("MemeFactory", function () {
  async function deployFactoryFixture() {
    const [owner, treasury, user1, user2, user3] = await ethers.getSigners();

    // Deploy Staking contract (using a mock token for now)
    const MockToken = await ethers.getContractFactory("MemeToken");
    const stakingToken = await MockToken.deploy(
      owner.address,
      "Platform Token",
      "PLAT",
      ethers.parseEther("1000000"),
      "Platform staking token",
      "",
      "",
      "",
      ""
    );

    const Staking = await ethers.getContractFactory("Staking");
    const staking = await Staking.deploy(await stakingToken.getAddress());

    // Deploy MemeFactory
    const MemeFactory = await ethers.getContractFactory("MemeFactory");
    const factory = await MemeFactory.deploy(treasury.address);

    // Setup
    const creationFee = ethers.parseEther("0.1");

    return { factory, staking, stakingToken, owner, treasury, user1, user2, user3, creationFee };
  }

  describe("Deployment", function () {
    it("Should set the correct treasury address", async function () {
      const { factory, treasury } = await loadFixture(deployFactoryFixture);
      expect(await factory.treasury()).to.equal(treasury.address);
    });

    it("Should set the correct initial parameters", async function () {
      const { factory } = await loadFixture(deployFactoryFixture);
      expect(await factory.creationFee()).to.equal(ethers.parseEther("0.1"));
      expect(await factory.platformTradingFee()).to.equal(50); // 0.5%
      expect(await factory.totalTokensCreated()).to.equal(0);
    });
  });

  describe("Token Creation", function () {
    it("Should create a new meme token", async function () {
      const { factory, user1, creationFee } = await loadFixture(deployFactoryFixture);
      
      await expect(
        factory.connect(user1).createToken(
          "Test Token",
          "TEST",
          "A test token",
          "image.png",
          "@test",
          "t.me/test",
          "test.com",
          { value: creationFee }
        )
      ).to.emit(factory, "TokenCreated");

      expect(await factory.totalTokensCreated()).to.equal(1);
      
      const tokens = await factory.getAllTokens();
      expect(tokens.length).to.equal(1);
      
      const tokenInfo = await factory.getTokenInfo(tokens[0]);
      expect(tokenInfo.name).to.equal("Test Token");
      expect(tokenInfo.symbol).to.equal("TEST");
      expect(tokenInfo.creator).to.equal(user1.address);
      expect(tokenInfo.isOpen).to.be.true;
      expect(tokenInfo.isLaunched).to.be.false;
    });

    it("Should fail if creation fee is insufficient", async function () {
      const { factory, user1 } = await loadFixture(deployFactoryFixture);
      
      await expect(
        factory.connect(user1).createToken(
          "Test Token",
          "TEST",
          "A test token",
          "image.png",
          "@test",
          "t.me/test",
          "test.com",
          { value: ethers.parseEther("0.05") }
        )
      ).to.be.revertedWithCustomError(factory, "MemeFactory__InsufficientFee");
    });

    it("Should fail with empty name or symbol", async function () {
      const { factory, user1, creationFee } = await loadFixture(deployFactoryFixture);
      
      await expect(
        factory.connect(user1).createToken(
          "",
          "TEST",
          "A test token",
          "image.png",
          "@test",
          "t.me/test",
          "test.com",
          { value: creationFee }
        )
      ).to.be.revertedWithCustomError(factory, "MemeFactory__InvalidParameters");
    });
  });

  describe("Token Trading - Bonding Curve", function () {
    let factory: MemeFactory;
    let tokenAddress: string;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    beforeEach(async function () {
      const fixture = await loadFixture(deployFactoryFixture);
      factory = fixture.factory;
      user1 = fixture.user1;
      user2 = fixture.user2;

      // Create a token
      await factory.connect(user1).createToken(
        "Test Token",
        "TEST",
        "A test token",
        "image.png",
        "@test",
        "t.me/test",
        "test.com",
        { value: fixture.creationFee }
      );

      const tokens = await factory.getAllTokens();
      tokenAddress = tokens[0];
    });

    it("Should allow buying tokens", async function () {
      const buyAmount = ethers.parseEther("1");
      
      await expect(
        factory.connect(user2).buyToken(tokenAddress, 0, { value: buyAmount })
      ).to.emit(factory, "TokenPurchased");

      const tokenInfo = await factory.getTokenInfo(tokenAddress);
      expect(tokenInfo.sold).to.be.gt(0);
      expect(tokenInfo.raised).to.be.gt(0);

      const token = await ethers.getContractAt("MemeToken", tokenAddress);
      const balance = await token.balanceOf(user2.address);
      expect(balance).to.be.gt(0);
    });

    it("Should calculate correct token amounts based on bonding curve", async function () {
      const ethIn = ethers.parseEther("1");
      const tokensOut = await factory.calculateTokensOut(0, ethIn);
      
      // With base price of 0.0001 ETH per token
      // 1 ETH should buy approximately 10,000 tokens (minus fees)
      expect(tokensOut).to.be.closeTo(ethers.parseEther("10000"), ethers.parseEther("100"));
    });

    it("Should apply platform fees correctly", async function () {
      const buyAmount = ethers.parseEther("1");
      const initialFactoryBalance = await ethers.provider.getBalance(await factory.getAddress());
      
      await factory.connect(user2).buyToken(tokenAddress, 0, { value: buyAmount });
      
      const finalFactoryBalance = await ethers.provider.getBalance(await factory.getAddress());
      const collected = finalFactoryBalance - initialFactoryBalance;
      
      // Should have collected the buy amount
      expect(collected).to.equal(buyAmount);
      
      const tokenInfo = await factory.getTokenInfo(tokenAddress);
      const platformFee = await factory.platformTradingFee();
      const expectedFee = (buyAmount * platformFee) / 10000n;
      const expectedRaised = buyAmount - expectedFee;
      
      expect(tokenInfo.raised).to.equal(expectedRaised);
    });

    it("Should allow selling tokens back", async function () {
      // First buy some tokens
      await factory.connect(user2).buyToken(tokenAddress, 0, { value: ethers.parseEther("1") });
      
      const token = await ethers.getContractAt("MemeToken", tokenAddress);
      const balance = await token.balanceOf(user2.address);
      
      // Approve factory to spend tokens
      await token.connect(user2).approve(await factory.getAddress(), balance);
      
      // Sell half the tokens
      const sellAmount = balance / 2n;
      const initialBalance = await ethers.provider.getBalance(user2.address);
      
      const tx = await factory.connect(user2).sellToken(tokenAddress, sellAmount, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      
      const finalBalance = await ethers.provider.getBalance(user2.address);
      expect(finalBalance).to.be.gt(initialBalance - gasUsed);
    });

    it("Should close sale when target is reached", async function () {
      // Buy enough to reach the target
      const largeAmount = ethers.parseEther("3.5");
      
      await factory.connect(user2).buyToken(tokenAddress, 0, { value: largeAmount });
      
      const tokenInfo = await factory.getTokenInfo(tokenAddress);
      expect(tokenInfo.isOpen).to.be.false;
      expect(tokenInfo.isLaunched).to.be.true;
    });

    it("Should not allow buying after launch", async function () {
      // Launch the token
      const largeAmount = ethers.parseEther("3.5");
      await factory.connect(user2).buyToken(tokenAddress, 0, { value: largeAmount });
      
      // Try to buy more
      await expect(
        factory.connect(user2).buyToken(tokenAddress, 0, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(factory, "MemeFactory__SaleClosed");
    });
  });

  describe("Token Launch", function () {
    it("Should allow creator to launch token to DEX", async function () {
      const { factory, user1, user2, creationFee } = await loadFixture(deployFactoryFixture);
      
      // Create and buy to launch
      await factory.connect(user1).createToken(
        "Test Token",
        "TEST",
        "A test token",
        "image.png",
        "@test",
        "t.me/test",
        "test.com",
        { value: creationFee }
      );
      
      const tokens = await factory.getAllTokens();
      const tokenAddress = tokens[0];
      
      // Buy enough to launch
      await factory.connect(user2).buyToken(tokenAddress, 0, { value: ethers.parseEther("3.5") });
      
      // Launch token
      const dexRouter = ethers.ZeroAddress; // Mock DEX router
      await expect(
        factory.connect(user1).launchToken(tokenAddress, dexRouter)
      ).to.not.be.reverted;
    });

    it("Should only allow creator to launch", async function () {
      const { factory, user1, user2, creationFee } = await loadFixture(deployFactoryFixture);
      
      // Create and buy to launch
      await factory.connect(user1).createToken(
        "Test Token",
        "TEST",
        "A test token",
        "image.png",
        "@test",
        "t.me/test",
        "test.com",
        { value: creationFee }
      );
      
      const tokens = await factory.getAllTokens();
      const tokenAddress = tokens[0];
      
      // Buy enough to launch
      await factory.connect(user2).buyToken(tokenAddress, 0, { value: ethers.parseEther("3.5") });
      
      // Try to launch as non-creator
      const dexRouter = ethers.ZeroAddress;
      await expect(
        factory.connect(user2).launchToken(tokenAddress, dexRouter)
      ).to.be.revertedWithCustomError(factory, "MemeFactory__NotOwner");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update creation fee", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);
      
      const newFee = ethers.parseEther("0.2");
      await factory.connect(owner).setCreationFee(newFee);
      expect(await factory.creationFee()).to.equal(newFee);
    });

    it("Should allow owner to update trading fee", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);
      
      await factory.connect(owner).setTradingFee(100); // 1%
      expect(await factory.platformTradingFee()).to.equal(100);
    });

    it("Should not allow trading fee above 1%", async function () {
      const { factory, owner } = await loadFixture(deployFactoryFixture);
      
      await expect(
        factory.connect(owner).setTradingFee(101)
      ).to.be.revertedWith("Fee too high");
    });

    it("Should allow owner to withdraw fees", async function () {
      const { factory, owner, treasury, user1, user2, creationFee } = await loadFixture(deployFactoryFixture);
      
      // Create token and generate fees
      await factory.connect(user1).createToken(
        "Test Token",
        "TEST",
        "A test token",
        "image.png",
        "@test",
        "t.me/test",
        "test.com",
        { value: creationFee }
      );
      
      const tokens = await factory.getAllTokens();
      await factory.connect(user2).buyToken(tokens[0], 0, { value: ethers.parseEther("1") });
      
      const initialTreasuryBalance = await ethers.provider.getBalance(treasury.address);
      await factory.connect(owner).withdrawFees();
      const finalTreasuryBalance = await ethers.provider.getBalance(treasury.address);
      
      expect(finalTreasuryBalance).to.be.gt(initialTreasuryBalance);
    });

    it("Should only allow owner to perform admin functions", async function () {
      const { factory, user1 } = await loadFixture(deployFactoryFixture);
      
      await expect(
        factory.connect(user1).setCreationFee(ethers.parseEther("0.2"))
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      
      await expect(
        factory.connect(user1).withdrawFees()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return tokens by creator", async function () {
      const { factory, user1, creationFee } = await loadFixture(deployFactoryFixture);
      
      // Create multiple tokens
      await factory.connect(user1).createToken(
        "Token 1",
        "TK1",
        "First token",
        "",
        "",
        "",
        "",
        { value: creationFee }
      );
      
      await factory.connect(user1).createToken(
        "Token 2",
        "TK2",
        "Second token",
        "",
        "",
        "",
        "",
        { value: creationFee }
      );
      
      const creatorTokens = await factory.getTokensByCreator(user1.address);
      expect(creatorTokens.length).to.equal(2);
    });

    it("Should track platform statistics", async function () {
      const { factory, user1, user2, creationFee } = await loadFixture(deployFactoryFixture);
      
      // Create token
      await factory.connect(user1).createToken(
        "Test Token",
        "TEST",
        "A test token",
        "",
        "",
        "",
        "",
        { value: creationFee }
      );
      
      const tokens = await factory.getAllTokens();
      
      // Buy tokens
      await factory.connect(user2).buyToken(tokens[0], 0, { value: ethers.parseEther("1") });
      
      expect(await factory.totalTokensCreated()).to.equal(1);
      expect(await factory.totalVolume()).to.equal(ethers.parseEther("1"));
      expect(await factory.totalFeesCollected()).to.be.gt(0);
    });
  });
});