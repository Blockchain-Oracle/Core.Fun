"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
var knex_1 = __importDefault(require("knex"));
var db = (0, knex_1.default)({
    client: 'postgresql',
    connection: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        user: process.env.POSTGRES_USER || 'core_user',
        password: process.env.POSTGRES_PASSWORD || 'core_secure_pass_2024',
        database: process.env.POSTGRES_DB || 'core_meme_platform'
    },
    pool: {
        min: 2,
        max: 10
    }
});
exports.db = db;
