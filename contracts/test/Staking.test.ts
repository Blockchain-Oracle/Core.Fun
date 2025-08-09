import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { Staking, MemeToken } from "../typechain-types";

describe("Staking", function () {
  async function deployStakingFixture() {
    const [owner, user1, user2, user3, treasury] = await ethers.getSigners();

    // Deploy staking token
    const MemeToken = await ethers.getContractFactory("MemeToken");
    const stakingToken = await MemeToken.deploy(
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

    // Deploy Staking contract
    const Staking = await ethers.getContractFactory("Staking");
    const staking = await Staking.deploy(await stakingToken.getAddress());

    // Enable trading for the token
    await stakingToken.enableTrading();

    // Distribute tokens to users
    await stakingToken.transfer(user1.address, ethers.parseEther("10000"));
    await stakingToken.transfer(user2.address, ethers.parseEther("10000"));
    await stakingToken.transfer(user3.address, ethers.parseEther("10000"));

    // Approve staking contract
    await stakingToken.connect(user1).approve(await staking.getAddress(), ethers.MaxUint256);
    await stakingToken.connect(user2).approve(await staking.getAddress(), ethers.MaxUint256);
    await stakingToken.connect(user3).approve(await staking.getAddress(), ethers.MaxUint256);

    return { staking, stakingToken, owner, user1, user2, user3, treasury };
  }

  describe("Deployment", function () {
    it("Should set the correct staking token", async function () {
      const { staking, stakingToken } = await loadFixture(deployStakingFixture);
      expect(await staking.stakingToken()).to.equal(await stakingToken.getAddress());
    });

    it("Should initialize pool correctly", async function () {
      const { staking } = await loadFixture(deployStakingFixture);
      const pool = await staking.pool();
      
      expect(pool.totalStaked).to.equal(0);
      expect(pool.accRewardPerShare).to.equal(0);
      expect(pool.rewardRate).to.equal(ethers.parseEther("0.01"));
    });

    it("Should setup tiers correctly", async function () {
      const { staking } = await loadFixture(deployStakingFixture);
      
      const tier0 = await staking.tiers(0); // Bronze
      expect(tier0.minStake).to.equal(ethers.parseEther("1000"));
      expect(tier0.feeDiscount).to.equal(100); // 1%
      
      const tier3 = await staking.tiers(3); // Platinum
      expect(tier3.minStake).to.equal(ethers.parseEther("50000"));
      expect(tier3.feeDiscount).to.equal(500); // 5%
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      const stakeAmount = ethers.parseEther("1000");
      
      await expect(staking.connect(user1).stake(stakeAmount))
        .to.emit(staking, "Staked")
        .withArgs(user1.address, stakeAmount, await time.latest() + 1);
      
      const userStake = await staking.stakes(user1.address);
      expect(userStake.amount).to.equal(stakeAmount);
      
      const pool = await staking.pool();
      expect(pool.totalStaked).to.equal(stakeAmount);
    });

    it("Should enforce minimum stake amount", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      const tooSmall = ethers.parseEther("50"); // Less than MIN_STAKE_AMOUNT (100)
      
      await expect(staking.connect(user1).stake(tooSmall))
        .to.be.revertedWithCustomError(staking, "Staking__InvalidAmount");
    });

    it("Should update premium status when threshold is reached", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      const premiumAmount = ethers.parseEther("10000"); // PREMIUM_THRESHOLD
      
      await staking.connect(user1).stake(premiumAmount);
      
      const userStake = await staking.stakes(user1.address);
      expect(userStake.isPremium).to.be.true;
      expect(await staking.premiumUsers(user1.address)).to.be.true;
    });

    it("Should calculate pending rewards correctly", async function () {
      const { staking, stakingToken, owner, user1 } = await loadFixture(deployStakingFixture);
      
      // Add rewards to the contract
      await stakingToken.transfer(await staking.getAddress(), ethers.parseEther("1000"));
      
      // Stake tokens
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      
      // Advance time
      await time.increase(100); // 100 seconds
      
      // Check pending rewards
      const pending = await staking.pendingReward(user1.address);
      expect(pending).to.be.gt(0);
    });
  });

  describe("Unstaking", function () {
    it("Should allow users to unstake tokens", async function () {
      const { staking, stakingToken, user1 } = await loadFixture(deployStakingFixture);
      
      const stakeAmount = ethers.parseEther("1000");
      await staking.connect(user1).stake(stakeAmount);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      
      await expect(staking.connect(user1).unstake(stakeAmount))
        .to.emit(staking, "Unstaked")
        .withArgs(user1.address, stakeAmount, await time.latest() + 1);
      
      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(stakeAmount);
      
      const userStake = await staking.stakes(user1.address);
      expect(userStake.amount).to.equal(0);
    });

    it("Should not allow unstaking more than staked", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      
      await expect(staking.connect(user1).unstake(ethers.parseEther("2000")))
        .to.be.revertedWithCustomError(staking, "Staking__InsufficientBalance");
    });

    it("Should update premium status when unstaking below threshold", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      await staking.connect(user1).stake(ethers.parseEther("10000"));
      expect(await staking.premiumUsers(user1.address)).to.be.true;
      
      await staking.connect(user1).unstake(ethers.parseEther("5000"));
      expect(await staking.premiumUsers(user1.address)).to.be.false;
    });
  });

  describe("Rewards", function () {
    it("Should allow claiming rewards", async function () {
      const { staking, stakingToken, owner, user1 } = await loadFixture(deployStakingFixture);
      
      // Add rewards to the contract
      await stakingToken.transfer(await staking.getAddress(), ethers.parseEther("1000"));
      
      // Stake tokens
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      
      // Advance time
      await time.increase(100);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      
      await expect(staking.connect(user1).claimRewards())
        .to.emit(staking, "RewardsClaimed");
      
      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not allow claiming with no rewards", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      await expect(staking.connect(user1).claimRewards())
        .to.be.revertedWithCustomError(staking, "Staking__NoRewards");
    });

    it("Should distribute revenue to stakers", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      // Stake tokens
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      
      // Add revenue
      await staking.addRevenue({ value: ethers.parseEther("10") });
      
      // Distribute revenue
      await expect(staking.distributeRevenue())
        .to.emit(staking, "RevenueDistributed");
      
      // Check pending rewards increased
      const pending = await staking.pendingReward(user1.address);
      expect(pending).to.be.gt(0);
    });
  });

  describe("Tier System", function () {
    it("Should return correct tier for stake amount", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      // No tier initially
      expect(await staking.getUserTier(user1.address)).to.equal(0);
      
      // Bronze tier (1000+)
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      expect(await staking.getUserTier(user1.address)).to.equal(0);
      
      // Silver tier (5000+)
      await staking.connect(user1).stake(ethers.parseEther("4000"));
      expect(await staking.getUserTier(user1.address)).to.equal(1);
      
      // Gold tier (10000+)
      await staking.connect(user1).stake(ethers.parseEther("5000"));
      expect(await staking.getUserTier(user1.address)).to.equal(2);
    });

    it("Should return correct fee discount for tier", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      // Stake for Bronze tier
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      expect(await staking.getUserFeeDiscount(user1.address)).to.equal(100); // 1%
      
      // Stake for Silver tier
      await staking.connect(user1).stake(ethers.parseEther("4000"));
      expect(await staking.getUserFeeDiscount(user1.address)).to.equal(200); // 2%
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set reward rate", async function () {
      const { staking, owner } = await loadFixture(deployStakingFixture);
      
      const newRate = ethers.parseEther("0.02");
      await expect(staking.connect(owner).setRewardRate(newRate))
        .to.emit(staking, "RewardRateUpdated")
        .withArgs(newRate);
      
      const pool = await staking.pool();
      expect(pool.rewardRate).to.equal(newRate);
    });

    it("Should allow owner to deposit rewards", async function () {
      const { staking, stakingToken, owner } = await loadFixture(deployStakingFixture);
      
      const rewardAmount = ethers.parseEther("1000");
      await stakingToken.approve(await staking.getAddress(), rewardAmount);
      
      const initialBalance = await stakingToken.balanceOf(await staking.getAddress());
      await staking.connect(owner).depositRewards(rewardAmount);
      const finalBalance = await stakingToken.balanceOf(await staking.getAddress());
      
      expect(finalBalance - initialBalance).to.equal(rewardAmount);
    });

    it("Should allow owner to update tiers", async function () {
      const { staking, owner } = await loadFixture(deployStakingFixture);
      
      await staking.connect(owner).updateTier(0, ethers.parseEther("2000"), 150);
      
      const tier = await staking.tiers(0);
      expect(tier.minStake).to.equal(ethers.parseEther("2000"));
      expect(tier.feeDiscount).to.equal(150);
    });

    it("Should not allow tier discount above 10%", async function () {
      const { staking, owner } = await loadFixture(deployStakingFixture);
      
      await expect(staking.connect(owner).updateTier(0, ethers.parseEther("1000"), 1001))
        .to.be.revertedWith("Discount too high");
    });

    it("Should only allow owner to perform admin functions", async function () {
      const { staking, user1 } = await loadFixture(deployStakingFixture);
      
      await expect(staking.connect(user1).setRewardRate(ethers.parseEther("0.02")))
        .to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow emergency withdraw", async function () {
      const { staking, stakingToken, user1 } = await loadFixture(deployStakingFixture);
      
      const stakeAmount = ethers.parseEther("1000");
      await staking.connect(user1).stake(stakeAmount);
      
      const initialBalance = await stakingToken.balanceOf(user1.address);
      
      await expect(staking.connect(user1).emergencyWithdraw())
        .to.emit(staking, "EmergencyWithdraw")
        .withArgs(user1.address, stakeAmount);
      
      const finalBalance = await stakingToken.balanceOf(user1.address);
      expect(finalBalance - initialBalance).to.equal(stakeAmount);
      
      const userStake = await staking.stakes(user1.address);
      expect(userStake.amount).to.equal(0);
      expect(userStake.rewardDebt).to.equal(0);
    });

    it("Should not give rewards on emergency withdraw", async function () {
      const { staking, stakingToken, owner, user1 } = await loadFixture(deployStakingFixture);
      
      // Add rewards
      await stakingToken.transfer(await staking.getAddress(), ethers.parseEther("1000"));
      
      // Stake and wait
      await staking.connect(user1).stake(ethers.parseEther("1000"));
      await time.increase(100);
      
      // Emergency withdraw
      const balanceBefore = await stakingToken.balanceOf(user1.address);
      await staking.connect(user1).emergencyWithdraw();
      const balanceAfter = await stakingToken.balanceOf(user1.address);
      
      // Should only get stake back, no rewards
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("View Functions", function () {
    it("Should return correct staking stats", async function () {
      const { staking, stakingToken, owner, user1 } = await loadFixture(deployStakingFixture);
      
      // Add rewards
      await stakingToken.transfer(await staking.getAddress(), ethers.parseEther("1000"));
      
      // Stake tokens
      await staking.connect(user1).stake(ethers.parseEther("5000"));
      
      // Advance time
      await time.increase(100);
      
      const stats = await staking.getStakingStats(user1.address);
      
      expect(stats.stakedAmount).to.equal(ethers.parseEther("5000"));
      expect(stats.pendingRewardAmount).to.be.gt(0);
      expect(stats.totalEarnedAmount).to.equal(0); // Haven't claimed yet
      expect(stats.userTier).to.equal(1); // Silver tier
      expect(stats.isPremium).to.be.false; // Not premium yet
    });
  });
});