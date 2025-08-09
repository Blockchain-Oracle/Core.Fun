// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error Staking__InvalidAmount();
error Staking__InsufficientBalance();
error Staking__NoRewards();
error Staking__TransferFailed();
error Staking__InvalidAddress();
error Staking__AlreadyInitialized();

contract Staking is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    // Platform token for staking
    IERC20 public stakingToken;
    
    // Staking details for each user
    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lastStakeTime;
        uint256 totalEarned;
        bool isPremium;
    }
    
    // Pool information
    struct PoolInfo {
        uint256 totalStaked;
        uint256 accRewardPerShare;
        uint256 lastRewardTime;
        uint256 rewardRate; // Rewards per second
    }
    
    // Tier system for premium benefits
    struct Tier {
        uint256 minStake;
        uint256 feeDiscount; // Basis points (100 = 1%)
        bool hasAccess;
        string name;
    }
    
    // State variables
    mapping(address => StakeInfo) public stakes;
    mapping(address => uint256) public pendingRewards;
    
    PoolInfo public pool;
    Tier[] public tiers;
    
    uint256 public totalRewardsDistributed;
    uint256 public rewardEndTime;
    uint256 public constant PRECISION = 1e12;
    uint256 public constant MIN_STAKE_AMOUNT = 100 ether;
    
    // Premium features
    uint256 public constant PREMIUM_THRESHOLD = 10000 ether;
    mapping(address => bool) public premiumUsers;
    
    // Revenue sharing
    uint256 public platformRevenue;
    uint256 public lastRevenueDistribution;
    uint256 public constant REVENUE_SHARE_PERCENTAGE = 5000; // 50%
    
    // Events
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 timestamp);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RevenueDistributed(uint256 amount, uint256 timestamp);
    event TierUpdated(address indexed user, uint256 tierLevel);
    event RewardRateUpdated(uint256 newRate);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    
    constructor(address _stakingToken) Ownable(msg.sender) {
        if(_stakingToken == address(0)) revert Staking__InvalidAddress();
        stakingToken = IERC20(_stakingToken);
        
        // Initialize pool
        pool.lastRewardTime = block.timestamp;
        pool.rewardRate = 0.01 ether; // 0.01 tokens per second initially
        
        // Setup tiers
        _setupTiers();
    }
    
    function _setupTiers() private {
        // Bronze Tier
        tiers.push(Tier({
            minStake: 1000 ether,
            feeDiscount: 100, // 1% discount
            hasAccess: true,
            name: "Bronze"
        }));
        
        // Silver Tier
        tiers.push(Tier({
            minStake: 5000 ether,
            feeDiscount: 200, // 2% discount
            hasAccess: true,
            name: "Silver"
        }));
        
        // Gold Tier
        tiers.push(Tier({
            minStake: 10000 ether,
            feeDiscount: 300, // 3% discount
            hasAccess: true,
            name: "Gold"
        }));
        
        // Platinum Tier
        tiers.push(Tier({
            minStake: 50000 ether,
            feeDiscount: 500, // 5% discount
            hasAccess: true,
            name: "Platinum"
        }));
    }
    
    // Stake tokens
    function stake(uint256 _amount) external nonReentrant {
        if(_amount < MIN_STAKE_AMOUNT) revert Staking__InvalidAmount();
        
        updatePool();
        
        StakeInfo storage userStake = stakes[msg.sender];
        
        // Calculate pending rewards before updating stake
        if(userStake.amount > 0) {
            uint256 pending = (userStake.amount * pool.accRewardPerShare / PRECISION) - userStake.rewardDebt;
            if(pending > 0) {
                pendingRewards[msg.sender] += pending;
            }
        }
        
        // Transfer tokens from user
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        
        // Update stake info
        userStake.amount += _amount;
        userStake.rewardDebt = userStake.amount * pool.accRewardPerShare / PRECISION;
        userStake.lastStakeTime = block.timestamp;
        
        // Update pool total
        pool.totalStaked += _amount;
        
        // Check premium status
        if(userStake.amount >= PREMIUM_THRESHOLD && !userStake.isPremium) {
            userStake.isPremium = true;
            premiumUsers[msg.sender] = true;
            emit TierUpdated(msg.sender, getUserTier(msg.sender));
        }
        
        emit Staked(msg.sender, _amount, block.timestamp);
    }
    
    // Unstake tokens
    function unstake(uint256 _amount) external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        
        if(userStake.amount < _amount) revert Staking__InsufficientBalance();
        
        updatePool();
        
        // Calculate pending rewards
        uint256 pending = (userStake.amount * pool.accRewardPerShare / PRECISION) - userStake.rewardDebt;
        if(pending > 0) {
            pendingRewards[msg.sender] += pending;
        }
        
        // Update stake info
        userStake.amount -= _amount;
        userStake.rewardDebt = userStake.amount * pool.accRewardPerShare / PRECISION;
        
        // Update pool total
        pool.totalStaked -= _amount;
        
        // Check premium status
        if(userStake.amount < PREMIUM_THRESHOLD && userStake.isPremium) {
            userStake.isPremium = false;
            premiumUsers[msg.sender] = false;
            emit TierUpdated(msg.sender, getUserTier(msg.sender));
        }
        
        // Transfer tokens back to user
        stakingToken.safeTransfer(msg.sender, _amount);
        
        emit Unstaked(msg.sender, _amount, block.timestamp);
    }
    
    // Claim rewards
    function claimRewards() external nonReentrant {
        updatePool();
        
        StakeInfo storage userStake = stakes[msg.sender];
        
        // Calculate all pending rewards
        uint256 pending = 0;
        if(userStake.amount > 0) {
            pending = (userStake.amount * pool.accRewardPerShare / PRECISION) - userStake.rewardDebt;
        }
        pending += pendingRewards[msg.sender];
        
        if(pending == 0) revert Staking__NoRewards();
        
        // Reset pending rewards
        pendingRewards[msg.sender] = 0;
        userStake.rewardDebt = userStake.amount * pool.accRewardPerShare / PRECISION;
        userStake.totalEarned += pending;
        
        // Update total distributed
        totalRewardsDistributed += pending;
        
        // Transfer rewards
        stakingToken.safeTransfer(msg.sender, pending);
        
        emit RewardsClaimed(msg.sender, pending);
    }
    
    // Update reward pool
    function updatePool() public {
        if(block.timestamp <= pool.lastRewardTime) {
            return;
        }
        
        if(pool.totalStaked == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }
        
        // Calculate rewards to distribute
        uint256 timeElapsed = block.timestamp - pool.lastRewardTime;
        uint256 rewards = timeElapsed * pool.rewardRate;
        
        // Check if we have rewards to distribute
        uint256 rewardBalance = stakingToken.balanceOf(address(this)) - pool.totalStaked;
        if(rewards > rewardBalance) {
            rewards = rewardBalance;
        }
        
        // Update accumulated reward per share
        pool.accRewardPerShare += (rewards * PRECISION) / pool.totalStaked;
        pool.lastRewardTime = block.timestamp;
    }
    
    // Distribute platform revenue to stakers
    function distributeRevenue() external nonReentrant {
        if(platformRevenue == 0) revert Staking__InvalidAmount();
        
        updatePool();
        
        uint256 toDistribute = (platformRevenue * REVENUE_SHARE_PERCENTAGE) / 10000;
        
        if(pool.totalStaked > 0) {
            pool.accRewardPerShare += (toDistribute * PRECISION) / pool.totalStaked;
        }
        
        platformRevenue = 0;
        lastRevenueDistribution = block.timestamp;
        
        emit RevenueDistributed(toDistribute, block.timestamp);
    }
    
    // Add platform revenue (called by factory)
    function addRevenue() external payable {
        platformRevenue += msg.value;
    }
    
    // Get user tier
    function getUserTier(address _user) public view returns (uint256) {
        uint256 userStake = stakes[_user].amount;
        
        for(uint256 i = tiers.length; i > 0; i--) {
            if(userStake >= tiers[i-1].minStake) {
                return i-1;
            }
        }
        
        return 0; // No tier
    }
    
    // Get user's fee discount
    function getUserFeeDiscount(address _user) external view returns (uint256) {
        uint256 tier = getUserTier(_user);
        if(tier >= tiers.length) return 0;
        return tiers[tier].feeDiscount;
    }
    
    // Check if user has premium access
    function isPremiumUser(address _user) external view returns (bool) {
        return stakes[_user].isPremium;
    }
    
    // Calculate pending rewards for a user
    function pendingReward(address _user) external view returns (uint256) {
        StakeInfo memory userStake = stakes[_user];
        
        if(userStake.amount == 0) {
            return pendingRewards[_user];
        }
        
        uint256 accRewardPerShare = pool.accRewardPerShare;
        
        if(block.timestamp > pool.lastRewardTime && pool.totalStaked > 0) {
            uint256 timeElapsed = block.timestamp - pool.lastRewardTime;
            uint256 rewards = timeElapsed * pool.rewardRate;
            
            uint256 rewardBalance = stakingToken.balanceOf(address(this)) - pool.totalStaked;
            if(rewards > rewardBalance) {
                rewards = rewardBalance;
            }
            
            accRewardPerShare += (rewards * PRECISION) / pool.totalStaked;
        }
        
        uint256 pending = (userStake.amount * accRewardPerShare / PRECISION) - userStake.rewardDebt;
        return pending + pendingRewards[_user];
    }
    
    // Get staking statistics
    function getStakingStats(address _user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewardAmount,
        uint256 totalEarnedAmount,
        uint256 userTier,
        bool isPremium
    ) {
        StakeInfo memory userStake = stakes[_user];
        
        stakedAmount = userStake.amount;
        pendingRewardAmount = this.pendingReward(_user);
        totalEarnedAmount = userStake.totalEarned;
        userTier = getUserTier(_user);
        isPremium = userStake.isPremium;
    }
    
    // Admin functions
    function setRewardRate(uint256 _rate) external onlyOwner {
        updatePool();
        pool.rewardRate = _rate;
        emit RewardRateUpdated(_rate);
    }
    
    function depositRewards(uint256 _amount) external onlyOwner {
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
    }
    
    function updateTier(
        uint256 _tierIndex,
        uint256 _minStake,
        uint256 _feeDiscount
    ) external onlyOwner {
        require(_tierIndex < tiers.length, "Invalid tier");
        require(_feeDiscount <= 1000, "Discount too high"); // Max 10%
        
        tiers[_tierIndex].minStake = _minStake;
        tiers[_tierIndex].feeDiscount = _feeDiscount;
    }
    
    // Emergency withdraw (no rewards)
    function emergencyWithdraw() external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        uint256 amount = userStake.amount;
        
        if(amount == 0) revert Staking__InsufficientBalance();
        
        // Reset user stake
        userStake.amount = 0;
        userStake.rewardDebt = 0;
        userStake.isPremium = false;
        premiumUsers[msg.sender] = false;
        
        // Update pool
        pool.totalStaked -= amount;
        
        // Transfer tokens
        stakingToken.safeTransfer(msg.sender, amount);
        
        emit EmergencyWithdraw(msg.sender, amount);
    }
    
    // Receive ETH for revenue sharing
    receive() external payable {
        platformRevenue += msg.value;
    }
}