// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MemeToken is ERC20, Ownable {
    // Token metadata
    string public description;
    string public image;
    string public twitter;
    string public telegram;
    string public website;
    
    // Trading controls
    uint256 public maxWallet;
    uint256 public maxTransaction;
    bool public tradingEnabled;
    
    // Anti-bot protection
    mapping(address => bool) public isBlacklisted;
    mapping(address => bool) public isWhitelisted;
    uint256 public launchBlock;
    uint256 public antiSnipeBlocks = 3;
    
    // Events
    event MetadataUpdated(string field, string value);
    event TradingEnabled(uint256 block);
    event BlacklistUpdated(address account, bool status);
    event WhitelistUpdated(address account, bool status);
    
    constructor(
        address _creator,
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        string memory _description,
        string memory _image,
        string memory _twitter,
        string memory _telegram,
        string memory _website
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        description = _description;
        image = _image;
        twitter = _twitter;
        telegram = _telegram;
        website = _website;
        
        // Set initial limits (2% of supply)
        maxWallet = (_totalSupply * 2) / 100;
        maxTransaction = (_totalSupply * 2) / 100;
        
        // Mint supply to factory
        _mint(msg.sender, _totalSupply);
        
        // Whitelist factory and creator
        isWhitelisted[msg.sender] = true;
        isWhitelisted[_creator] = true;
    }
    
    // Enable trading (called by factory when launched)
    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "Already enabled");
        tradingEnabled = true;
        launchBlock = block.number;
        emit TradingEnabled(block.number);
    }
    
    // Update metadata
    function updateDescription(string memory _description) external onlyOwner {
        description = _description;
        emit MetadataUpdated("description", _description);
    }
    
    function updateImage(string memory _image) external onlyOwner {
        image = _image;
        emit MetadataUpdated("image", _image);
    }
    
    function updateSocials(
        string memory _twitter,
        string memory _telegram,
        string memory _website
    ) external onlyOwner {
        twitter = _twitter;
        telegram = _telegram;
        website = _website;
        emit MetadataUpdated("socials", "updated");
    }
    
    // Trading controls
    function setMaxWallet(uint256 _maxWallet) external onlyOwner {
        require(_maxWallet >= totalSupply() / 100, "Too low"); // Min 1%
        maxWallet = _maxWallet;
    }
    
    function setMaxTransaction(uint256 _maxTransaction) external onlyOwner {
        require(_maxTransaction >= totalSupply() / 200, "Too low"); // Min 0.5%
        maxTransaction = _maxTransaction;
    }
    
    // Blacklist management
    function updateBlacklist(address _account, bool _status) external onlyOwner {
        isBlacklisted[_account] = _status;
        emit BlacklistUpdated(_account, _status);
    }
    
    function updateWhitelist(address _account, bool _status) external onlyOwner {
        isWhitelisted[_account] = _status;
        emit WhitelistUpdated(_account, _status);
    }
    
    // Override transfer to include protections
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Allow factory operations
        if(isWhitelisted[from] || isWhitelisted[to]) {
            super._update(from, to, amount);
            return;
        }
        
        require(!isBlacklisted[from] && !isBlacklisted[to], "Blacklisted");
        
        // Trading must be enabled
        if(from != address(0) && to != address(0)) {
            require(tradingEnabled, "Trading not enabled");
            
            // Anti-snipe protection
            if(block.number <= launchBlock + antiSnipeBlocks) {
                require(isWhitelisted[to], "Anti-snipe protection");
            }
            
            // Max transaction check
            require(amount <= maxTransaction, "Exceeds max transaction");
            
            // Max wallet check
            if(to != address(0)) {
                require(
                    balanceOf(to) + amount <= maxWallet,
                    "Exceeds max wallet"
                );
            }
        }
        
        super._update(from, to, amount);
    }
    
    // Renounce ownership (for full decentralization)
    function renounceOwnership() public override onlyOwner {
        // Remove all limits when renouncing
        maxWallet = totalSupply();
        maxTransaction = totalSupply();
        super.renounceOwnership();
    }
    
    // Token metadata for platforms
    function getMetadata() external view returns (
        string memory _description,
        string memory _image,
        string memory _twitter,
        string memory _telegram,
        string memory _website,
        uint256 _maxWallet,
        uint256 _maxTransaction,
        bool _tradingEnabled,
        address _owner
    ) {
        return (
            description,
            image,
            twitter,
            telegram,
            website,
            maxWallet,
            maxTransaction,
            tradingEnabled,
            owner()
        );
    }
}