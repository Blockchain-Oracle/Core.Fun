// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

library BondingCurve {
    uint256 constant PRECISION = 1e18;
    uint256 constant BASE_PRICE = 0.0001 ether;
    uint256 constant PRICE_INCREMENT = 0.0001 ether;
    uint256 constant STEP_SIZE = 10000 ether;
    uint256 constant MAX_SUPPLY = 500000 ether;
    
    /**
     * @dev Calculate the price at a given supply level
     * @param currentSupply The current supply of tokens
     * @return The price per token in ETH
     */
    function getCurrentPrice(uint256 currentSupply) internal pure returns (uint256) {
        uint256 steps = currentSupply / STEP_SIZE;
        return BASE_PRICE + (PRICE_INCREMENT * steps);
    }
    
    /**
     * @dev Calculate tokens that can be purchased with given ETH
     * @param currentSupply Current token supply
     * @param ethAmount Amount of ETH to spend
     * @return tokensOut Amount of tokens that can be purchased
     */
    function calculateTokensOut(
        uint256 currentSupply,
        uint256 ethAmount
    ) internal pure returns (uint256 tokensOut) {
        require(ethAmount > 0, "Invalid ETH amount");
        require(currentSupply < MAX_SUPPLY, "Max supply reached");
        
        uint256 remainingEth = ethAmount;
        uint256 currentSupplyTemp = currentSupply;
        
        while (remainingEth > 0 && currentSupplyTemp < MAX_SUPPLY) {
            uint256 currentPrice = getCurrentPrice(currentSupplyTemp);
            uint256 tokensInCurrentStep = STEP_SIZE - (currentSupplyTemp % STEP_SIZE);
            uint256 costForCurrentStep = (tokensInCurrentStep * currentPrice) / PRECISION;
            
            if (remainingEth >= costForCurrentStep) {
                tokensOut += tokensInCurrentStep;
                currentSupplyTemp += tokensInCurrentStep;
                remainingEth -= costForCurrentStep;
            } else {
                uint256 tokensPurchasable = (remainingEth * PRECISION) / currentPrice;
                tokensOut += tokensPurchasable;
                remainingEth = 0;
            }
        }
        
        return tokensOut;
    }
    
    /**
     * @dev Calculate ETH received for selling tokens
     * @param currentSupply Current token supply
     * @param tokenAmount Amount of tokens to sell
     * @return ethOut Amount of ETH to receive
     */
    function calculateETHOut(
        uint256 currentSupply,
        uint256 tokenAmount
    ) internal pure returns (uint256 ethOut) {
        require(tokenAmount > 0, "Invalid token amount");
        require(tokenAmount <= currentSupply, "Insufficient supply");
        
        uint256 remainingTokens = tokenAmount;
        uint256 currentSupplyTemp = currentSupply;
        
        while (remainingTokens > 0) {
            uint256 currentPrice = getCurrentPrice(currentSupplyTemp - remainingTokens);
            uint256 tokensInCurrentStep = currentSupplyTemp % STEP_SIZE;
            
            if (tokensInCurrentStep == 0) {
                tokensInCurrentStep = STEP_SIZE;
            }
            
            if (remainingTokens >= tokensInCurrentStep) {
                ethOut += (tokensInCurrentStep * currentPrice) / PRECISION;
                currentSupplyTemp -= tokensInCurrentStep;
                remainingTokens -= tokensInCurrentStep;
            } else {
                ethOut += (remainingTokens * currentPrice) / PRECISION;
                remainingTokens = 0;
            }
        }
        
        return ethOut;
    }
    
    /**
     * @dev Calculate the market cap at a given supply
     * @param currentSupply The current supply of tokens
     * @return The market cap in ETH
     */
    function getMarketCap(uint256 currentSupply) internal pure returns (uint256) {
        uint256 currentPrice = getCurrentPrice(currentSupply);
        return (currentSupply * currentPrice) / PRECISION;
    }
    
    /**
     * @dev Calculate the total cost to buy up to a certain supply
     * @param targetSupply The target supply to reach
     * @return totalCost The total ETH needed
     */
    function getTotalCost(uint256 targetSupply) internal pure returns (uint256 totalCost) {
        require(targetSupply <= MAX_SUPPLY, "Target exceeds max supply");
        
        uint256 currentSupply = 0;
        
        while (currentSupply < targetSupply) {
            uint256 currentPrice = getCurrentPrice(currentSupply);
            uint256 tokensInStep = STEP_SIZE;
            
            if (currentSupply + tokensInStep > targetSupply) {
                tokensInStep = targetSupply - currentSupply;
            }
            
            totalCost += (tokensInStep * currentPrice) / PRECISION;
            currentSupply += tokensInStep;
        }
        
        return totalCost;
    }
    
    /**
     * @dev Calculate price impact of a buy order
     * @param currentSupply Current token supply
     * @param ethAmount Amount of ETH to spend
     * @return priceImpact The price impact percentage (basis points)
     */
    function calculatePriceImpact(
        uint256 currentSupply,
        uint256 ethAmount
    ) internal pure returns (uint256 priceImpact) {
        uint256 currentPrice = getCurrentPrice(currentSupply);
        uint256 tokensOut = calculateTokensOut(currentSupply, ethAmount);
        uint256 newSupply = currentSupply + tokensOut;
        uint256 newPrice = getCurrentPrice(newSupply);
        
        if (newPrice > currentPrice) {
            priceImpact = ((newPrice - currentPrice) * 10000) / currentPrice;
        }
        
        return priceImpact;
    }
    
    /**
     * @dev Check if a buy would exceed slippage tolerance
     * @param currentSupply Current token supply
     * @param ethAmount Amount of ETH to spend
     * @param maxSlippage Maximum allowed slippage in basis points
     * @return Whether the buy is within slippage tolerance
     */
    function isWithinSlippage(
        uint256 currentSupply,
        uint256 ethAmount,
        uint256 maxSlippage
    ) internal pure returns (bool) {
        uint256 impact = calculatePriceImpact(currentSupply, ethAmount);
        return impact <= maxSlippage;
    }
}