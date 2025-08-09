// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IMemeFactory {
    struct TokenSale {
        address token;
        string name;
        string symbol;
        address creator;
        uint256 sold;
        uint256 raised;
        bool isOpen;
        bool isLaunched;
        uint256 createdAt;
        uint256 launchedAt;
    }
    
    event TokenCreated(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 timestamp
    );
    
    event TokenPurchased(
        address indexed token,
        address indexed buyer,
        uint256 amount,
        uint256 cost,
        uint256 timestamp
    );
    
    event TokenLaunched(
        address indexed token,
        uint256 liquidityAdded,
        uint256 timestamp
    );
    
    function createToken(
        string memory _name,
        string memory _symbol,
        string memory _description,
        string memory _image,
        string memory _twitter,
        string memory _telegram,
        string memory _website
    ) external payable;
    
    function buyToken(address _token, uint256 _minTokens) external payable;
    
    function sellToken(address _token, uint256 _amount, uint256 _minETH) external;
    
    function launchToken(address _token, address _dexRouter) external;
    
    function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) external pure returns (uint256);
    
    function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) external pure returns (uint256);
    
    function getTokensByCreator(address _creator) external view returns (address[] memory);
    
    function getAllTokens() external view returns (address[] memory);
    
    function getTokenInfo(address _token) external view returns (TokenSale memory);
    
    function isOurToken(address _token) external view returns (bool);
    
    function creationFee() external view returns (uint256);
    
    function platformTradingFee() external view returns (uint256);
    
    function totalTokensCreated() external view returns (uint256);
    
    function totalVolume() external view returns (uint256);
}