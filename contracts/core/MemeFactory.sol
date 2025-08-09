// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./MemeToken.sol";

error MemeFactory__InsufficientFee();
error MemeFactory__InsufficientETH();
error MemeFactory__SaleClosed();
error MemeFactory__TokenAmountTooLow();
error MemeFactory__AmountExceeded();
error MemeFactory__TransferFailed();
error MemeFactory__InvalidParameters();
error MemeFactory__TokenAlreadyLaunched();
error MemeFactory__NotOwner();

contract MemeFactory is ReentrancyGuard, Ownable {
    // Constants for bonding curve
    uint256 public constant TOKEN_LIMIT = 500_000 ether;
    uint256 public constant TARGET = 3 ether;
    uint256 public constant MAX_SUPPLY = 1_000_000 ether;
    
    // Platform configuration
    uint256 public creationFee = 0.1 ether;
    uint256 public platformTradingFee = 50; // 0.5%
    address public treasury;
    
    // Token sale structure
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
    
    // Storage
    mapping(address => TokenSale) public tokenToSale;
    mapping(address => address[]) public creatorTokens;
    mapping(address => bool) public isOurToken;
    
    address[] public allTokens;
    uint256 public totalTokensCreated;
    uint256 public totalVolume;
    uint256 public totalFeesCollected;
    
    // Events
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
    
    event FeesWithdrawn(address indexed to, uint256 amount);
    event CreationFeeUpdated(uint256 newFee);
    event TradingFeeUpdated(uint256 newFee);
    
    constructor(address _treasury) Ownable(msg.sender) {
        treasury = _treasury;
    }
    
    // Create new meme token
    function createToken(
        string memory _name,
        string memory _symbol,
        string memory _description,
        string memory _image,
        string memory _twitter,
        string memory _telegram,
        string memory _website
    ) public payable nonReentrant {
        if(msg.value < creationFee) revert MemeFactory__InsufficientFee();
        if(bytes(_name).length == 0 || bytes(_symbol).length == 0) 
            revert MemeFactory__InvalidParameters();
        
        // Create new token
        MemeToken token = new MemeToken(
            msg.sender,
            _name,
            _symbol,
            MAX_SUPPLY,
            _description,
            _image,
            _twitter,
            _telegram,
            _website
        );
        
        // Store token info
        TokenSale memory sale = TokenSale({
            token: address(token),
            name: _name,
            symbol: _symbol,
            creator: msg.sender,
            sold: 0,
            raised: 0,
            isOpen: true,
            isLaunched: false,
            createdAt: block.timestamp,
            launchedAt: 0
        });
        
        tokenToSale[address(token)] = sale;
        creatorTokens[msg.sender].push(address(token));
        isOurToken[address(token)] = true;
        allTokens.push(address(token));
        
        totalTokensCreated++;
        totalFeesCollected += creationFee;
        
        emit TokenCreated(
            address(token),
            msg.sender,
            _name,
            _symbol,
            block.timestamp
        );
    }
    
    // Buy tokens using bonding curve
    function buyToken(address _token, uint256 _minTokens) 
        external 
        payable 
        nonReentrant 
    {
        TokenSale storage sale = tokenToSale[_token];
        
        if(!sale.isOpen) revert MemeFactory__SaleClosed();
        if(sale.isLaunched) revert MemeFactory__TokenAlreadyLaunched();
        if(msg.value < 0.001 ether) revert MemeFactory__InsufficientETH();
        
        // Calculate tokens to receive based on bonding curve
        uint256 tokensToReceive = calculateTokensOut(sale.sold, msg.value);
        
        if(tokensToReceive < _minTokens) revert MemeFactory__TokenAmountTooLow();
        if(sale.sold + tokensToReceive > TOKEN_LIMIT) revert MemeFactory__AmountExceeded();
        
        // Apply platform fee
        uint256 fee = (msg.value * platformTradingFee) / 10000;
        uint256 amountAfterFee = msg.value - fee;
        
        // Update sale state
        sale.sold += tokensToReceive;
        sale.raised += amountAfterFee;
        totalVolume += msg.value;
        totalFeesCollected += fee;
        
        // Check if ready to launch
        if(sale.sold >= TOKEN_LIMIT || sale.raised >= TARGET) {
            sale.isOpen = false;
            sale.isLaunched = true;
            sale.launchedAt = block.timestamp;
            
            emit TokenLaunched(_token, sale.raised, block.timestamp);
        }
        
        // Transfer tokens
        MemeToken(_token).transfer(msg.sender, tokensToReceive);
        
        emit TokenPurchased(
            _token,
            msg.sender,
            tokensToReceive,
            msg.value,
            block.timestamp
        );
    }
    
    // Sell tokens back to bonding curve
    function sellToken(address _token, uint256 _amount, uint256 _minETH) 
        external 
        nonReentrant 
    {
        TokenSale storage sale = tokenToSale[_token];
        
        if(sale.isLaunched) revert MemeFactory__TokenAlreadyLaunched();
        if(_amount == 0) revert MemeFactory__TokenAmountTooLow();
        
        // Calculate ETH to receive
        uint256 ethToReceive = calculateETHOut(sale.sold, _amount);
        
        if(ethToReceive < _minETH) revert MemeFactory__InsufficientETH();
        if(ethToReceive > sale.raised) revert MemeFactory__InsufficientETH();
        
        // Apply platform fee
        uint256 fee = (ethToReceive * platformTradingFee) / 10000;
        uint256 amountAfterFee = ethToReceive - fee;
        
        // Update sale state
        sale.sold -= _amount;
        sale.raised -= ethToReceive;
        totalVolume += ethToReceive;
        totalFeesCollected += fee;
        
        // Transfer tokens back and send ETH
        MemeToken(_token).transferFrom(msg.sender, address(this), _amount);
        
        (bool success, ) = msg.sender.call{value: amountAfterFee}("");
        if(!success) revert MemeFactory__TransferFailed();
    }
    
    // Launch token to DEX (creator only)
    function launchToken(address _token, address _dexRouter) external {
        TokenSale storage sale = tokenToSale[_token];
        
        if(msg.sender != sale.creator) revert MemeFactory__NotOwner();
        if(!sale.isLaunched) revert MemeFactory__SaleClosed();
        
        // Transfer remaining tokens and ETH to DEX
        // This would integrate with Core DEXes like ShadowSwap
        // For now, transfer to creator
        
        MemeToken token = MemeToken(_token);
        uint256 remainingTokens = token.balanceOf(address(this));
        
        if(remainingTokens > 0) {
            token.transfer(sale.creator, remainingTokens);
        }
        
        if(sale.raised > 0) {
            (bool success, ) = sale.creator.call{value: sale.raised}("");
            if(!success) revert MemeFactory__TransferFailed();
            sale.raised = 0;
        }
    }
    
    // Bonding curve pricing functions
    function calculateTokensOut(uint256 _currentSold, uint256 _ethIn) 
        public 
        pure 
        returns (uint256) 
    {
        // Simplified bonding curve: price increases linearly
        uint256 basePrice = 0.0001 ether;
        uint256 priceIncrement = 0.0001 ether;
        uint256 step = 10000 ether;
        
        uint256 currentPrice = basePrice + (priceIncrement * (_currentSold / step));
        uint256 tokensOut = (_ethIn * 1e18) / currentPrice;
        
        return tokensOut;
    }
    
    function calculateETHOut(uint256 _currentSold, uint256 _tokensIn) 
        public 
        pure 
        returns (uint256) 
    {
        // Reverse bonding curve calculation
        uint256 basePrice = 0.0001 ether;
        uint256 priceIncrement = 0.0001 ether;
        uint256 step = 10000 ether;
        
        uint256 newSold = _currentSold - _tokensIn;
        uint256 currentPrice = basePrice + (priceIncrement * (newSold / step));
        uint256 ethOut = (_tokensIn * currentPrice) / 1e18;
        
        return ethOut;
    }
    
    // View functions
    function getTokensByCreator(address _creator) 
        external 
        view 
        returns (address[] memory) 
    {
        return creatorTokens[_creator];
    }
    
    function getAllTokens() external view returns (address[] memory) {
        return allTokens;
    }
    
    function getTokenInfo(address _token) 
        external 
        view 
        returns (TokenSale memory) 
    {
        return tokenToSale[_token];
    }
    
    // Admin functions
    function setCreationFee(uint256 _fee) external onlyOwner {
        creationFee = _fee;
        emit CreationFeeUpdated(_fee);
    }
    
    function setTradingFee(uint256 _fee) external onlyOwner {
        require(_fee <= 100, "Fee too high"); // Max 1%
        platformTradingFee = _fee;
        emit TradingFeeUpdated(_fee);
    }
    
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = treasury.call{value: balance}("");
        if(!success) revert MemeFactory__TransferFailed();
        
        emit FeesWithdrawn(treasury, balance);
    }
    
    // Emergency functions
    function emergencyWithdrawToken(address _token, uint256 _amount) 
        external 
        onlyOwner 
    {
        IERC20(_token).transfer(treasury, _amount);
    }
}