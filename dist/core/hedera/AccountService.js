"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HederaAccountService = void 0;
const sdk_1 = require("@hashgraph/sdk");
const long_1 = __importDefault(require("long"));
const axios_1 = __importDefault(require("axios"));
const ContractService_1 = __importDefault(require("./ContractService"));
const ethers_1 = require("ethers");
// Dynamic import for ES Module compatibility
let secp256k1;
async function getSecp256k1() {
    if (!secp256k1) {
        secp256k1 = await Promise.resolve().then(() => __importStar(require("@noble/secp256k1")));
    }
    return secp256k1;
}
class HederaAccountService {
    // private emailService = new EmailService();
    // private emailReceipient = process.env.EMAIL_NOTIFICATION || null;
    constructor(config) {
        const { network, operatorId, operatorKey, contracts } = config;
        this.network = network;
        this.operatorId = operatorId;
        this.operatorKey = operatorKey;
        this.contracts = contracts || {};
        this.client = sdk_1.Client.forName(this.network);
        this.client.setOperator(this.operatorId, this.operatorKey);
        this.client = sdk_1.Client.forName(this.network);
        this.client.setOperator(this.operatorId, this.operatorKey);
    }
    /************************ */
    // Create new device, three topics and register to smart-contract
    //Create DID for the device
    /************************ */
    // Function to create a new Hedera account
    async registerAccount(userId, publicKey) {
        let userPublicKey;
        let userPrivateKey = null;
        if (publicKey) {
            //  console.log(publicKey);
            userPublicKey = publicKey;
        }
        else {
            userPrivateKey = sdk_1.PrivateKey.generateECDSA();
            userPublicKey = userPrivateKey.publicKey;
        }
        const operatorId = this.operatorId;
        const operatorKey = this.operatorKey;
        if (!operatorId || !operatorKey) {
            throw new Error("operator not configured");
        }
        const tx = new sdk_1.AccountCreateTransaction()
            .setKey(userPublicKey)
            .setInitialBalance(new sdk_1.Hbar(15))
            .setAlias(userPublicKey.toEvmAddress());
        const txResponse = await tx.execute(this.client);
        const receipt = await txResponse.getReceipt(this.client);
        const accountId = receipt.accountId;
        const result = {
            accountId: accountId.toString(),
            publicKey: userPublicKey.toStringDer(),
            privateKey: userPrivateKey ? userPrivateKey.toStringDer() : null,
            evmAddress: "0x" + userPublicKey.toEvmAddress()
        };
        return result;
    }
    // Function to register a new device
    async createDeviceAccountAndTopics(deviceName, smartContract, deviceRole, serialNumber, deviceType, price, parentAccountId, parentPublicKey) {
        try {
            const devicePrivateKey = sdk_1.PrivateKey.generateECDSA();
            const devicePublicKey = devicePrivateKey.publicKey.toString();
            const requiredBalance = new sdk_1.Hbar(5).toTinybars();
            const availableBalance = await this.getAccountBalanceTinybars(parentAccountId);
            if (availableBalance.toNumber() < requiredBalance.toNumber()) {
                throw new Error(`Insufficient sponsor balance. Required: ${requiredBalance} tinybars, Available: ${availableBalance} tinybars`);
            }
            // Validate price
            if (typeof price === 'undefined' || price === null || isNaN(Number(price)) || !isFinite(Number(price))) {
                console.warn(`Invalid price value: ${price}, defaulting to 0`);
                price = 0;
            }
            // 2. Create Hedera account
            const { accountId, topics } = await this.createDeviceAndTopics(parentAccountId, devicePrivateKey.toString(), devicePublicKey, 5);
            // Register the peer with the topics
            const contractId = Object.entries(this.contracts).find(([key]) => key.toLowerCase() === smartContract.toLowerCase())?.[1];
            if (!contractId) {
                throw new Error(`Contract ID not found for smart contract type: ${smartContract}`);
            }
            const hederaService = new ContractService_1.default({
                network: this.network,
                operatorId: this.operatorId,
                operatorKey: this.operatorKey,
                contractId: contractId
            });
            /* const contractEnvVar = {
                 adsb: "CONTRACT_ID",
                 weather: "WEATHER_CONTRACT_ID",
                 mcp: "MCP_CONTRACT_ID",
                 radiation: "RADIATION_CONTRACT_ID",
             }[smartContract.toLowerCase()];
             */
            await hederaService.registerPeers({ stdIn: topics[0], stdOut: topics[1], stdErr: topics[2] }, deviceName, [Number(0)], [price], devicePrivateKey.toString(), accountId, contractId);
            /*await hederaService.putPeerForOwner(
                parentPublicKey,
                { stdIn: topics[0], stdOut: topics[1], stdErr: topics[2] },
                deviceName,
                [Number(0)],
                [price],
                devicePrivateKey.toString(),
                accountId,
                contractId
            );*/
            try {
                const devices = await hederaService.getDevicesFlatByOwner(parentPublicKey, contractId);
            }
            catch (error) {
                console.error("Error getting devices:", error);
            }
            // console.log("Devices:", devices);
            return { accountId, topics, privateKey: devicePrivateKey.toString(), evmAddress: sdk_1.PublicKey.fromString(devicePublicKey).toEvmAddress() };
        }
        catch (error) {
            console.error("Error registering new device:", error);
            throw error;
        }
    }
    // Function to create a device account and related topics
    async createDeviceAndTopics(parentAccountId, devicePrivateKey, devicePublicKey, initialHbar = 1) {
        try {
            const devicePublicKeyObj = sdk_1.PublicKey.fromString(devicePublicKey);
            const evmAddress = devicePublicKeyObj.toEvmAddress();
            // Ensure initialHbar is always an integer
            const safeInitialHbar = Math.floor(Number(initialHbar));
            console.log('DEBUG: initialHbar (before Hbar):', initialHbar, '->', safeInitialHbar);
            const accountTx = new sdk_1.AccountCreateTransaction()
                .setKey(devicePublicKeyObj)
                .setInitialBalance(new sdk_1.Hbar(safeInitialHbar))
                .setAlias(evmAddress)
                .setTransactionMemo("Device of user " + parentAccountId);
            await accountTx.freezeWith(this.client);
            const accountReceipt = await (await accountTx.execute(this.client)).getReceipt(this.client);
            const newDeviceAccountId = accountReceipt.accountId;
            if (!newDeviceAccountId) {
                throw new Error('Account creation failed. No account ID returned.');
            }
            // Step 2: Create topics using the device's private key
            const devicePrivateKeyObj = sdk_1.PrivateKey.fromString(devicePrivateKey);
            await this.transferTinybars(newDeviceAccountId.toString(), new sdk_1.Hbar(1).toTinybars());
            // Step 3: Create topics for stdIn, stdOut, and stdErr concurrently
            const topicNames = ['stdIn', 'stdOut', 'stdErr'];
            // const topicPromises = topicNames.map(topicName => this.createTopic(this.client, newDeviceAccountId.toString(), devicePrivateKey, topicName + " for account " + newDeviceAccountId.toString()));
            const topicPromises = topicNames.map(topicName => {
                const isPublic = topicName === 'stdIn';
                const submitKey = isPublic ? null : devicePublicKeyObj;
                return this.createTopic(this.client, newDeviceAccountId.toString(), devicePrivateKey, `${topicName} for account ${newDeviceAccountId}`, submitKey);
            });
            // Step 4: Wait for all topic creations to complete
            const topics = await Promise.all(topicPromises);
            return {
                accountId: newDeviceAccountId.toString(),
                topics: topics,
                privateKey: devicePrivateKey
            };
        }
        catch (error) {
            console.error('Error creating device and topics:', error);
            throw error;
        }
    }
    async createTopic(client, accountId, privateKey, topicMemo, submitKey = null) {
        // Set the operator for the client (parent account with private key)
        client.setOperator(sdk_1.AccountId.fromString(accountId), sdk_1.PrivateKey.fromString(privateKey));
        try {
            // Create a new topic creation transaction
            const topicCreateTx = new sdk_1.TopicCreateTransaction()
                .setTopicMemo(topicMemo); // Set the topic memo (topic name)
            if (submitKey) {
                topicCreateTx.setSubmitKey(submitKey);
            }
            await topicCreateTx.freezeWith(client);
            // Execute the transaction
            const txResponse = await topicCreateTx.execute(client);
            // Wait for the transaction receipt to ensure completion
            const receipt = await txResponse.getReceipt(client);
            // Check if the receipt contains a valid topic ID
            if (!receipt.topicId) {
                throw new Error(`Failed to create topic. Receipt did not contain a valid topicId.`);
            }
            // Return the topic ID as a string
            return receipt.topicId.toString();
        }
        catch (error) {
            console.error("Error creating topic:", error);
            throw error;
        }
    }
    async getAccountBalanceTinybars(accountId) {
        try {
            // Create the account balance query
            const query = new sdk_1.AccountBalanceQuery()
                .setAccountId(accountId);
            // Execute the query
            const accountBalance = await query.execute(this.client);
            return accountBalance.hbars.toTinybars();
        }
        catch (error) {
            console.error("Error retrieving account balance:", error);
            return new long_1.default(0);
        }
    }
    async transferTinybars(recipientAccountId, transferAmount = new long_1.default(0)) {
        const senderAccount = this.operatorId;
        const operatorKey = sdk_1.PrivateKey.fromString(this.operatorKey);
        try {
            const availableBalance = await this.getAccountBalanceTinybars(senderAccount);
            const fee = new sdk_1.Hbar(1).toTinybars(); // 1 HBAR in tinybars
            if (availableBalance.lessThan(transferAmount.add(fee))) {
                console.log("Insufficient balance incl. fee.");
                throw new Error(`Insufficient balance. Needed: ${transferAmount.add(fee)} tinybars, Available: ${availableBalance}`);
            }
            const sendHbar = await new sdk_1.TransferTransaction()
                .addHbarTransfer(senderAccount, sdk_1.Hbar.fromTinybars(long_1.default.fromValue(transferAmount).neg().toString()))
                .addHbarTransfer(recipientAccountId, sdk_1.Hbar.fromTinybars(long_1.default.fromValue(transferAmount).toString()))
                .setTransactionId(sdk_1.TransactionId.generate(senderAccount))
                .setMaxTransactionFee(fee)
                .freezeWith(this.client)
                .sign(operatorKey);
            const txResponse = await sendHbar.execute(this.client);
            const receipt = await txResponse.getReceipt(this.client);
            console.log("Transfer status:", receipt.status.toString());
        }
        catch (error) {
            console.error("Error transferring HBAR:", error);
            throw error;
        }
    }
    /**
     * Fetches messages from a Hedera topic using the Mirror Node API
     * @param topicId The ID of the topic to fetch messages from
     * @param startSequence The starting sequence number (inclusive)
     * @param batchSize The number of messages to fetch
     * @returns Array of messages with their sequence numbers and timestamps
     */
    async getTopicMessages(topicId, startSequence, batchSize, order = 'asc') {
        try {
            // Validate inputs
            if (!topicId) {
                throw new Error('Topic ID is required');
            }
            if (startSequence < 0) {
                throw new Error('Start sequence must be non-negative');
            }
            if (batchSize <= 0) {
                throw new Error('Batch size must be positive');
            }
            // Determine the mirror node URL based on the network
            const mirrorNodeUrl = this.network === 'mainnet'
                ? 'https://mainnet-public.mirrornode.hedera.com'
                : 'https://testnet.mirrornode.hedera.com';
            // Fetch messages from the mirror node
            const response = await axios_1.default.get(`${mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=${batchSize}&order=${order}`);
            if (!response.data || !response.data.messages) {
                throw new Error('Invalid response from mirror node');
            }
            // Process and return the messages
            return response.data.messages.map((msg) => ({
                sequenceNumber: msg.sequence_number,
                message: Buffer.from(msg.message, 'base64').toString('utf-8'),
                timestamp: msg.consensus_timestamp
            }));
        }
        catch (error) {
            console.error('Error fetching topic messages:', error);
            throw new Error(`Failed to fetch topic messages: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /* Writes a message to a specified Hedera topic
    * @param topicId The ID of the topic to write to
    * @param message The message content to submit
    * @param privateKey Optional private key for signing (required if submit key is set on topic)
    * @param accountId Optional account ID associated with the private key
    * @returns Transaction receipt and message sequence number
    * @throws Error if the message submission fails
    */
    async submitMessageToTopic(topicId, message, privateKey, accountId) {
        try {
            // Validate inputs
            if (!topicId) {
                throw new Error('Topic ID is required');
            }
            if (!message) {
                throw new Error('Message content is required');
            }
            // Convert message to Uint8Array if it's a string
            const messageBytes = typeof message === 'string'
                ? new TextEncoder().encode(message)
                : message;
            // Create a temporary client if using a different account
            let client = this.client;
            if (privateKey && accountId) {
                client = sdk_1.Client.forName(this.network);
                client.setOperator(sdk_1.AccountId.fromString(accountId), sdk_1.PrivateKey.fromString(privateKey));
            }
            // Create topic message submission transaction
            const topicMessageTx = new sdk_1.TopicMessageSubmitTransaction()
                .setTopicId(topicId)
                .setMessage(messageBytes);
            // Execute the transaction
            const txResponse = await topicMessageTx.execute(client);
            // Get the receipt
            const receipt = await txResponse.getReceipt(client);
            // Verify the transaction was successful
            if (receipt.status !== sdk_1.Status.Success) {
                throw new Error(`Topic message submission failed with status: ${receipt.status}`);
            }
            // Get the transaction record to access sequence number
            const record = await txResponse.getRecord(client);
            return {
                receipt,
                sequenceNumber: receipt.topicSequenceNumber || long_1.default.ZERO
            };
        }
        catch (error) {
            console.error('Error submitting message to topic:', error);
            throw new Error(`Failed to submit message to topic: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getEvmAddressFromPublicKey(publicKey) {
        const cleanPubKey = publicKey.replace('0x', '');
        // Check if it's a compressed public key (starts with 02 or 03)
        if (cleanPubKey.startsWith('02') || cleanPubKey.startsWith('03')) {
            // Decompress the public key
            const secp = await getSecp256k1();
            const point = secp.Point.fromHex(cleanPubKey);
            const uncompressed = point.toRawBytes(false); // false = uncompressed
            // Remove the 0x04 prefix and hash the remaining 64 bytes
            const hash = (0, ethers_1.keccak256)(uncompressed.slice(1));
            const address = '0x' + hash.slice(-40);
            return (0, ethers_1.getAddress)(address);
        }
        else {
            // For uncompressed public keys (starts with 04)
            const pubKeyWithPrefix = publicKey.startsWith('0x') ? publicKey : '0x' + publicKey;
            const hash = (0, ethers_1.keccak256)(pubKeyWithPrefix);
            const address = '0x' + hash.slice(-40);
            return (0, ethers_1.getAddress)(address);
        }
    }
    /**
     * Fetches the admin key associated with an EVM address
     * @param evmAddress The EVM address to look up
     * @returns The admin key in Hedera format
     */
    async getAdminKeyFromEvmAddress(evmAddress) {
        try {
            // Validate input
            if (!evmAddress) {
                throw new Error('EVM address is required');
            }
            // Remove '0x' prefix if present
            const cleanEvmAddress = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
            // Create account info query to get the account details
            const query = new sdk_1.AccountInfoQuery()
                .setAccountId(sdk_1.AccountId.fromEvmAddress(0, 0, cleanEvmAddress));
            // Execute the query
            const accountInfo = await query.execute(this.client);
            // Check if account has an admin key
            if (!accountInfo.key) {
                throw new Error('Account does not have an admin key');
            }
            // Return the admin key in string format
            return accountInfo.key.toString();
        }
        catch (error) {
            console.error('Error fetching admin key from EVM address:', error);
            throw new Error(`Failed to get admin key from EVM address: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.HederaAccountService = HederaAccountService;
exports.default = HederaAccountService;
