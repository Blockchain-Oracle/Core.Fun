#!/usr/bin/env ts-node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var dotenv_1 = __importDefault(require("dotenv"));
var db_1 = require("../api/src/db");
// Load environment variables
dotenv_1.default.config({ path: '../../.env' });
// Simple logger
var logger = {
    info: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return console.log.apply(console, __spreadArray(['[INFO]'], args, false));
    },
    warn: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return console.warn.apply(console, __spreadArray(['[WARN]'], args, false));
    },
    error: function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return console.error.apply(console, __spreadArray(['[ERROR]'], args, false));
    }
};
// MemeToken ABI (minimal Transfer event)
var MemeTokenABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];
// Blockchain provider
var provider = new ethers_1.ethers.JsonRpcProvider(process.env.CORE_RPC_URL || 'https://1114.rpc.thirdweb.com');
function getTokens() {
    return __awaiter(this, void 0, void 0, function () {
        var tokens, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, db_1.db)('tokens')
                            .select('address', 'name', 'symbol', 'created_at')
                            .orderBy('created_at', 'desc')];
                case 1:
                    tokens = _a.sent();
                    logger.info("Found ".concat(tokens.length, " tokens in database"));
                    return [2 /*return*/, tokens];
                case 2:
                    error_1 = _a.sent();
                    logger.error('Failed to fetch tokens:', error_1);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function getTransferEvents(tokenAddress_1) {
    return __awaiter(this, arguments, void 0, function (tokenAddress, fromBlock) {
        var tokenContract, currentBlock, events, batchSize, startBlock, endBlock, filter, logs, _i, logs_1, log, error_2, error_3;
        if (fromBlock === void 0) { fromBlock = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    logger.info("Fetching Transfer events for ".concat(tokenAddress, " from block ").concat(fromBlock));
                    tokenContract = new ethers_1.ethers.Contract(tokenAddress, MemeTokenABI, provider);
                    return [4 /*yield*/, provider.getBlockNumber()];
                case 1:
                    currentBlock = _a.sent();
                    events = [];
                    batchSize = 5000;
                    startBlock = fromBlock;
                    _a.label = 2;
                case 2:
                    if (!(startBlock <= currentBlock)) return [3 /*break*/, 7];
                    endBlock = Math.min(startBlock + batchSize - 1, currentBlock);
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    filter = tokenContract.filters.Transfer();
                    return [4 /*yield*/, tokenContract.queryFilter(filter, startBlock, endBlock)];
                case 4:
                    logs = _a.sent();
                    if (logs.length > 0) {
                        logger.info("Found ".concat(logs.length, " Transfer events in blocks ").concat(startBlock, "-").concat(endBlock));
                    }
                    for (_i = 0, logs_1 = logs; _i < logs_1.length; _i++) {
                        log = logs_1[_i];
                        if (log.args) {
                            events.push({
                                from: log.args[0],
                                to: log.args[1],
                                value: log.args[2].toString(),
                                tokenAddress: tokenAddress,
                                blockNumber: log.blockNumber,
                                transactionHash: log.transactionHash,
                                logIndex: log.index
                            });
                        }
                    }
                    return [3 /*break*/, 6];
                case 5:
                    error_2 = _a.sent();
                    logger.warn("Error fetching events for blocks ".concat(startBlock, "-").concat(endBlock, ":"), error_2);
                    return [3 /*break*/, 6];
                case 6:
                    startBlock += batchSize;
                    return [3 /*break*/, 2];
                case 7:
                    logger.info("Total Transfer events found: ".concat(events.length));
                    return [2 /*return*/, events];
                case 8:
                    error_3 = _a.sent();
                    logger.error("Failed to fetch Transfer events for ".concat(tokenAddress, ":"), error_3);
                    return [2 /*return*/, []];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function processTransferEvents(events) {
    return __awaiter(this, void 0, void 0, function () {
        var ZERO_ADDRESS, tokenAddress, balances, sortedEvents, _i, sortedEvents_1, event_1, from, to, value, currentBalance, newBalance, currentBalance, holders;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (events.length === 0)
                        return [2 /*return*/];
                    ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
                    tokenAddress = events[0].tokenAddress.toLowerCase();
                    balances = new Map();
                    sortedEvents = events.sort(function (a, b) {
                        if (a.blockNumber !== b.blockNumber)
                            return a.blockNumber - b.blockNumber;
                        return a.logIndex - b.logIndex;
                    });
                    logger.info("Processing ".concat(sortedEvents.length, " Transfer events chronologically"));
                    for (_i = 0, sortedEvents_1 = sortedEvents; _i < sortedEvents_1.length; _i++) {
                        event_1 = sortedEvents_1[_i];
                        from = event_1.from.toLowerCase();
                        to = event_1.to.toLowerCase();
                        value = BigInt(event_1.value);
                        // Update sender balance (if not mint)
                        if (from !== ZERO_ADDRESS.toLowerCase()) {
                            currentBalance = balances.get(from) || 0n;
                            newBalance = currentBalance - value;
                            if (newBalance > 0n) {
                                balances.set(from, newBalance);
                            }
                            else {
                                balances.delete(from); // Remove if balance is 0
                            }
                        }
                        // Update receiver balance (if not burn)
                        if (to !== ZERO_ADDRESS.toLowerCase()) {
                            currentBalance = balances.get(to) || 0n;
                            balances.set(to, currentBalance + value);
                        }
                    }
                    holders = Array.from(balances.entries())
                        .filter(function (_a) {
                        var _ = _a[0], balance = _a[1];
                        return balance > 0n;
                    })
                        .map(function (_a) {
                        var address = _a[0], balance = _a[1];
                        return ({
                            token_address: tokenAddress,
                            address: address,
                            balance: balance.toString(),
                            last_updated: new Date(),
                            first_seen: new Date()
                        });
                    });
                    logger.info("Final holder count: ".concat(holders.length));
                    if (!(holders.length > 0)) return [3 /*break*/, 2];
                    // Store holder balances in database
                    return [4 /*yield*/, db_1.db.transaction(function (trx) { return __awaiter(_this, void 0, void 0, function () {
                            var _i, holders_1, holder, eventRecords;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: 
                                    // Clear existing holders for this token
                                    return [4 /*yield*/, trx('token_holders')
                                            .where({ token_address: tokenAddress })
                                            .delete()];
                                    case 1:
                                        // Clear existing holders for this token
                                        _a.sent();
                                        _i = 0, holders_1 = holders;
                                        _a.label = 2;
                                    case 2:
                                        if (!(_i < holders_1.length)) return [3 /*break*/, 5];
                                        holder = holders_1[_i];
                                        return [4 /*yield*/, trx('token_holders')
                                                .insert(holder)
                                                .onConflict(['token_address', 'address'])
                                                .merge({
                                                balance: holder.balance,
                                                last_updated: holder.last_updated
                                            })];
                                    case 3:
                                        _a.sent();
                                        _a.label = 4;
                                    case 4:
                                        _i++;
                                        return [3 /*break*/, 2];
                                    case 5: 
                                    // Update holder count in tokens table
                                    return [4 /*yield*/, trx('tokens')
                                            .where({ address: tokenAddress })
                                            .update({ holders_count: holders.length })];
                                    case 6:
                                        // Update holder count in tokens table
                                        _a.sent();
                                        eventRecords = sortedEvents.slice(-1000).map(function (e) { return ({
                                            token_address: e.tokenAddress.toLowerCase(),
                                            from_address: e.from.toLowerCase(),
                                            to_address: e.to.toLowerCase(),
                                            value: e.value,
                                            block_number: e.blockNumber,
                                            transaction_hash: e.transactionHash,
                                            log_index: e.logIndex,
                                            timestamp: new Date()
                                        }); });
                                        if (!(eventRecords.length > 0)) return [3 /*break*/, 8];
                                        return [4 /*yield*/, trx('transfer_events')
                                                .insert(eventRecords)
                                                .onConflict(['transaction_hash', 'log_index'])
                                                .ignore()];
                                    case 7:
                                        _a.sent();
                                        _a.label = 8;
                                    case 8: return [2 /*return*/];
                                }
                            });
                        }); })];
                case 1:
                    // Store holder balances in database
                    _a.sent();
                    logger.info("\u2705 Updated ".concat(holders.length, " holders for token ").concat(tokenAddress));
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
function syncTokenHolders(token) {
    return __awaiter(this, void 0, void 0, function () {
        var currentBlock, fromBlock, events, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    logger.info("\n\uD83D\uDCCA Syncing holders for ".concat(token.symbol, " (").concat(token.address, ")"));
                    return [4 /*yield*/, provider.getBlockNumber()];
                case 1:
                    currentBlock = _a.sent();
                    fromBlock = Math.max(0, currentBlock - 10000);
                    return [4 /*yield*/, getTransferEvents(token.address, fromBlock)];
                case 2:
                    events = _a.sent();
                    // Process events to calculate holder balances
                    return [4 /*yield*/, processTransferEvents(events)];
                case 3:
                    // Process events to calculate holder balances
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_4 = _a.sent();
                    logger.error("Failed to sync holders for ".concat(token.symbol, ":"), error_4);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var blockNumber, tokens, _i, tokens_1, token, summary, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger.info('🚀 Starting holder synchronization...');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, 11, 13]);
                    // Check database connection
                    return [4 /*yield*/, db_1.db.raw('SELECT 1')];
                case 2:
                    // Check database connection
                    _a.sent();
                    logger.info('✅ Database connected');
                    return [4 /*yield*/, provider.getBlockNumber()];
                case 3:
                    blockNumber = _a.sent();
                    logger.info("\u2705 Connected to blockchain at block ".concat(blockNumber));
                    return [4 /*yield*/, getTokens()];
                case 4:
                    tokens = _a.sent();
                    if (tokens.length === 0) {
                        logger.warn('No tokens found in database');
                        process.exit(0);
                    }
                    _i = 0, tokens_1 = tokens;
                    _a.label = 5;
                case 5:
                    if (!(_i < tokens_1.length)) return [3 /*break*/, 8];
                    token = tokens_1[_i];
                    return [4 /*yield*/, syncTokenHolders(token)];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 5];
                case 8: return [4 /*yield*/, (0, db_1.db)('tokens')
                        .select('name', 'symbol', 'holders_count')
                        .where('holders_count', '>', 0)
                        .orderBy('holders_count', 'desc')];
                case 9:
                    summary = _a.sent();
                    logger.info('\n📈 Holder Summary:');
                    summary.forEach(function (t) {
                        logger.info("  ".concat(t.symbol, ": ").concat(t.holders_count, " holders"));
                    });
                    logger.info('\n✅ Holder synchronization complete!');
                    return [3 /*break*/, 13];
                case 10:
                    error_5 = _a.sent();
                    logger.error('Fatal error:', error_5);
                    process.exit(1);
                    return [3 /*break*/, 13];
                case 11: return [4 /*yield*/, db_1.db.destroy()];
                case 12:
                    _a.sent();
                    process.exit(0);
                    return [7 /*endfinally*/];
                case 13: return [2 /*return*/];
            }
        });
    });
}
// Run the script
if (require.main === module) {
    main();
}
