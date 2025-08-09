// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMemeToken is IERC20 {
    struct TokenMetadata {
        string description;
        string image;
        string twitter;
        string telegram;
        string website;
    }
    
    struct TradingRestrictions {
        uint256 maxWalletAmount;
        uint256 maxTransactionAmount;
        uint256 cooldownPeriod;
        bool tradingEnabled;
        bool isLaunched;
    }
    
    event TradingEnabled(uint256 timestamp);
    event TradingDisabled(uint256 timestamp);
    event TokenLaunched(uint256 timestamp);
    event MaxWalletUpdated(uint256 newAmount);
    event MaxTransactionUpdated(uint256 newAmount);
    event CooldownUpdated(uint256 newPeriod);
    event MetadataUpdated(string field, string value);
    event OwnershipRenounced(uint256 timestamp);
    
    function enableTrading() external;
    
    function disableTrading() external;
    
    function launchToken() external;
    
    function renounceOwnership() external;
    
    function setMaxWalletAmount(uint256 _amount) external;
    
    function setMaxTransactionAmount(uint256 _amount) external;
    
    function setCooldownPeriod(uint256 _seconds) external;
    
    function updateMetadata(
        string memory _description,
        string memory _image,
        string memory _twitter,
        string memory _telegram,
        string memory _website
    ) external;
    
    function getMetadata() external view returns (TokenMetadata memory);
    
    function getTradingRestrictions() external view returns (TradingRestrictions memory);
    
    function isExcludedFromLimits(address account) external view returns (bool);
    
    function factory() external view returns (address);
    
    function creator() external view returns (address);
    
    function launchedAt() external view returns (uint256);
}