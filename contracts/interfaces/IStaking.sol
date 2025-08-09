// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IStaking {
    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lastStakeTime;
        uint256 totalEarned;
        bool isPremium;
    }
    
    struct PoolInfo {
        uint256 totalStaked;
        uint256 accRewardPerShare;
        uint256 lastRewardTime;
        uint256 rewardRate;
    }
    
    struct Tier {
        uint256 minStake;
        uint256 feeDiscount;
        bool hasAccess;
        string name;
    }
    
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RevenueDistributed(uint256 amount, uint256 timestamp);
    event TierUpdated(address indexed user, uint256 tierLevel);
    event RewardRateUpdated(uint256 newRate);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    
    function stake(uint256 _amount) external;
    
    function unstake(uint256 _amount) external;
    
    function claimRewards() external;
    
    function distributeRevenue() external;
    
    function addRevenue() external payable;
    
    function getUserTier(address _user) external view returns (uint256);
    
    function getUserFeeDiscount(address _user) external view returns (uint256);
    
    function isPremiumUser(address _user) external view returns (bool);
    
    function pendingReward(address _user) external view returns (uint256);
    
    function getStakingStats(address _user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewardAmount,
        uint256 totalEarnedAmount,
        uint256 userTier,
        bool isPremium
    );
    
    function stakingToken() external view returns (address);
    
    function pool() external view returns (PoolInfo memory);
    
    function stakes(address _user) external view returns (StakeInfo memory);
    
    function totalRewardsDistributed() external view returns (uint256);
    
    function platformRevenue() external view returns (uint256);
}