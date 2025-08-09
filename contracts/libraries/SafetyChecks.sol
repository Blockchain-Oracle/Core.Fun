// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library SafetyChecks {
    uint256 constant MAX_OWNERSHIP_PERCENTAGE = 5000; // 50%
    uint256 constant MIN_LIQUIDITY_THRESHOLD = 1 ether;
    uint256 constant MAX_TX_PERCENTAGE = 500; // 5%
    uint256 constant MAX_WALLET_PERCENTAGE = 1000; // 10%
    
    struct TokenSafety {
        bool hasRenounced;
        bool hasLiquidity;
        bool hasMaxWallet;
        bool hasMaxTx;
        bool isHoneypot;
        uint256 rugScore;
        uint256 liquidityAmount;
        uint256 holderCount;
        uint256 topHolderPercentage;
    }
    
    /**
     * @dev Calculate rug score for a token (0-100, lower is safer)
     * @param token The token address
     * @param liquidityAmount Amount of liquidity
     * @param hasRenounced Whether ownership is renounced
     * @param topHolderBalance Balance of top holder
     * @param totalSupply Total supply of token
     * @return rugScore The calculated rug score
     */
    function calculateRugScore(
        address token,
        uint256 liquidityAmount,
        bool hasRenounced,
        uint256 topHolderBalance,
        uint256 totalSupply
    ) internal view returns (uint256 rugScore) {
        // Base score starts at 50
        rugScore = 50;
        
        // Check liquidity (0-25 points)
        if (liquidityAmount < MIN_LIQUIDITY_THRESHOLD) {
            rugScore += 25;
        } else if (liquidityAmount < 5 ether) {
            rugScore += 15;
        } else if (liquidityAmount < 10 ether) {
            rugScore += 5;
        }
        
        // Check ownership (0-15 points)
        if (!hasRenounced) {
            rugScore += 15;
        }
        
        // Check concentration (0-10 points)
        uint256 topHolderPercentage = (topHolderBalance * 10000) / totalSupply;
        if (topHolderPercentage > MAX_OWNERSHIP_PERCENTAGE) {
            rugScore += 10;
        } else if (topHolderPercentage > 3000) {
            rugScore += 5;
        }
        
        return rugScore;
    }
    
    /**
     * @dev Check if a token is potentially a honeypot
     * @param token The token address
     * @return isHoneypot Whether the token appears to be a honeypot
     */
    function checkHoneypot(address token) internal view returns (bool isHoneypot) {
        // Basic honeypot detection
        // In production, this would include more sophisticated checks
        
        // Check if contract has unusual functions
        bytes memory data = abi.encodeWithSignature("canSell()");
        (bool success, bytes memory result) = token.staticcall(data);
        
        if (success && result.length > 0) {
            bool canSell = abi.decode(result, (bool));
            if (!canSell) {
                return true;
            }
        }
        
        // Check for blacklist function
        data = abi.encodeWithSignature("isBlacklisted(address)", address(this));
        (success, result) = token.staticcall(data);
        
        if (success && result.length > 0) {
            bool isBlacklisted = abi.decode(result, (bool));
            if (isBlacklisted) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * @dev Validate token parameters before creation
     * @param name Token name
     * @param symbol Token symbol
     * @param totalSupply Total supply
     * @return isValid Whether parameters are valid
     */
    function validateTokenParams(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) internal pure returns (bool isValid) {
        // Check name length
        if (bytes(name).length == 0 || bytes(name).length > 32) {
            return false;
        }
        
        // Check symbol length
        if (bytes(symbol).length == 0 || bytes(symbol).length > 10) {
            return false;
        }
        
        // Check total supply
        if (totalSupply == 0 || totalSupply > 1e30) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev Check if an address is a contract
     * @param account The address to check
     * @return Whether the address is a contract
     */
    function isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }
    
    /**
     * @dev Validate trading limits
     * @param maxWallet Maximum wallet amount
     * @param maxTx Maximum transaction amount
     * @param totalSupply Total supply
     * @return isValid Whether limits are reasonable
     */
    function validateTradingLimits(
        uint256 maxWallet,
        uint256 maxTx,
        uint256 totalSupply
    ) internal pure returns (bool isValid) {
        // Max wallet should be at least 1% of supply
        if (maxWallet < (totalSupply / 100)) {
            return false;
        }
        
        // Max tx should be at least 0.5% of supply
        if (maxTx < (totalSupply / 200)) {
            return false;
        }
        
        // Max wallet should be greater than max tx
        if (maxWallet < maxTx) {
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev Calculate holder concentration metrics
     * @param holders Array of holder addresses
     * @param balances Array of holder balances
     * @param totalSupply Total supply
     * @return giniCoefficient The Gini coefficient (0-10000, higher = more concentrated)
     */
    function calculateConcentration(
        address[] memory holders,
        uint256[] memory balances,
        uint256 totalSupply
    ) internal pure returns (uint256 giniCoefficient) {
        require(holders.length == balances.length, "Mismatched arrays");
        
        if (holders.length == 0) {
            return 10000; // Maximum concentration
        }
        
        // Simplified Gini coefficient calculation
        uint256 cumulativeBalance = 0;
        uint256 cumulativePercentage = 0;
        
        for (uint256 i = 0; i < holders.length; i++) {
            cumulativeBalance += balances[i];
            uint256 percentageOfHolders = ((i + 1) * 10000) / holders.length;
            uint256 percentageOfSupply = (cumulativeBalance * 10000) / totalSupply;
            cumulativePercentage += (percentageOfHolders * percentageOfSupply);
        }
        
        // Calculate Gini coefficient
        uint256 perfectEquality = 5000 * 10000; // Area under perfect equality line
        giniCoefficient = (perfectEquality - cumulativePercentage) / 5000;
        
        return giniCoefficient;
    }
    
    /**
     * @dev Check if liquidity is locked
     * @param liquidityToken The LP token address
     * @param lockerAddress Common locker contract addresses
     * @return isLocked Whether liquidity appears to be locked
     * @return unlockTime When liquidity unlocks (0 if not locked)
     */
    function checkLiquidityLock(
        address liquidityToken,
        address[] memory lockerAddress
    ) internal view returns (bool isLocked, uint256 unlockTime) {
        for (uint256 i = 0; i < lockerAddress.length; i++) {
            uint256 balance = IERC20(liquidityToken).balanceOf(lockerAddress[i]);
            if (balance > 0) {
                // Check if there's a timelock
                // This is simplified - actual implementation would check locker contracts
                isLocked = true;
                unlockTime = block.timestamp + 30 days; // Placeholder
                return (isLocked, unlockTime);
            }
        }
        
        return (false, 0);
    }
    
    /**
     * @dev Analyze token for safety metrics
     * @param token The token to analyze
     * @return safety The safety metrics
     */
    function analyzeTokenSafety(
        address token
    ) internal view returns (TokenSafety memory safety) {
        // Check if token is a contract
        if (!isContract(token)) {
            safety.rugScore = 100; // Maximum risk
            return safety;
        }
        
        // Check honeypot
        safety.isHoneypot = checkHoneypot(token);
        
        // Get total supply
        uint256 totalSupply = IERC20(token).totalSupply();
        
        // Calculate initial rug score
        safety.rugScore = safety.isHoneypot ? 100 : 50;
        
        return safety;
    }
}