"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Hash = sha256Hash;
const crypto_1 = require("crypto");
function sha256Hash(data) {
    return (0, crypto_1.createHash)('sha256').update(data).digest('hex');
}
