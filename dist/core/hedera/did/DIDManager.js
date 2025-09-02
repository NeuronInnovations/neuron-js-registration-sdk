import { PrivateKey, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import bs58 from 'bs58';
import { sha256Hash } from "../../../utils/helpers";
export class DIDManager {
    constructor(client, config) {
        this.client = client;
        this.config = config;
    }
    generateDIDString(topicId, publicKey) {
        // Validate topic ID format (0.0.123)
        if (!/^\d+\.\d+\.\d+$/.test(topicId)) {
            throw new Error("Invalid Hedera topic ID format. Expected 0.0.123");
        }
        const network = this.getNetworkString();
        const publicKeyBytes = publicKey.toBytes();
        const publicKeyBase58 = bs58.encode(publicKeyBytes);
        // Format: did:hedera:{network}:{base58key}_{accountId}.{topicId}
        return `did:hedera:${network}:${publicKeyBase58}_${topicId}`;
    }
    getNetworkString() {
        const networkName = this.client.network.toString().toLowerCase();
        // Hedera network name mapping
        switch (networkName) {
            case 'mainnet': return 'mainnet';
            case 'testnet': return 'testnet';
            case 'previewnet': return 'testnet'; // previewnet uses testnet in DIDs
            default: return 'testnet'; // fallback to testnet
        }
    }
    signDIDDocument(document, privateKey) {
        const docString = JSON.stringify(document);
        const docBytes = new TextEncoder().encode(docString);
        const signature = Buffer.from(privateKey.sign(docBytes)).toString("base64");
        return {
            ...document,
            proof: {
                type: "Ed25519Signature2020",
                created: new Date().toISOString(),
                verificationMethod: document.verificationMethod[0].id,
                signature
            }
        };
    }
    async publishDIDOperation(operation, topicId) {
        const message = Buffer.from(JSON.stringify(operation));
        await new TopicMessageSubmitTransaction()
            .setTopicId(topicId)
            .setMessage(message)
            .execute(this.client);
    }
    async createDeviceDID(deviceDetails) {
        const { deviceDIDFields } = deviceDetails;
        if (!deviceDIDFields?.smartContract || !deviceDIDFields.serialNumber) {
            throw new Error("Missing required fields for Device DID");
        }
        deviceDIDFields.serialNumber = sha256Hash(deviceDIDFields.serialNumber);
        const topicId = this.config.defaultTopicId;
        const privateKey = PrivateKey.generate();
        const publicKey = privateKey.publicKey;
        const did = this.generateDIDString(topicId, publicKey);
        const deviceFields = JSON.stringify(deviceDetails, null, 2);
        const document = {
            // "@context": "https://www.w3.org/ns/did/v1",
            id: did,
            verificationMethod: [{
                    id: `${did}#key-1`,
                    type: "Ed25519VerificationKey2020",
                    controller: did,
                    publicKeyMultibase: this.getED25519Raw(privateKey)
                }],
            authentication: [`${did}#key-1`],
            //  assertionMethod: [`${did}#key-1`],
            // service: services || [],
            customFields: { deviceDIDFields }
        };
        const signedDoc = this.signDIDDocument(document, privateKey);
        await this.publishDIDOperation({
            operation: "CREATE",
            did,
            document: signedDoc,
            //  signer: privateKey,
            timestamp: new Date().toISOString()
        }, topicId);
        return {
            did,
            document: signedDoc,
            // privateKey: privateKey.toString(),
            topicId
        };
    }
    async createAIAgentDID(agentDetails) {
        const { aiAgentDIDFields } = agentDetails;
        if (!aiAgentDIDFields?.agentType) {
            throw new Error("Missing required fields for AI Agent DID");
        }
        const topicId = this.config.defaultTopicId;
        const privateKey = PrivateKey.generate();
        const publicKey = privateKey.publicKey;
        const uniqueId = `${aiAgentDIDFields?.agentType}-${Date.now()}`;
        const did = this.generateDIDString(topicId, privateKey.publicKey);
        //this.generateDIDString("ai", uniqueId);
        const document = {
            // "@context": "https://www.w3.org/ns/did/v1",
            id: did,
            verificationMethod: [{
                    id: `${did}#key-1`,
                    type: "Ed25519VerificationKey2020",
                    controller: did,
                    publicKeyMultibase: this.getED25519Raw(privateKey)
                }],
            authentication: [`${did}#key-1`],
            //  assertionMethod: [`${did}#key-1`],
            customFields: { aiAgentDIDFields }
        };
        const signedDoc = this.signDIDDocument(document, privateKey);
        await this.publishDIDOperation({
            operation: "CREATE",
            did,
            document: signedDoc,
            //  signer: privateKey,
            timestamp: new Date().toISOString()
        }, this.config.defaultTopicId);
        return {
            did,
            document: signedDoc,
            //  privateKey: privateKey.toString(),
            topicId: this.config.defaultTopicId
        };
    }
    getED25519Raw(privateKey) {
        const publicKeyBytes = privateKey.publicKey.toBytes();
        const publicKeyBase58 = bs58.encode(publicKeyBytes);
        const publicKeyMultibase = `z${publicKeyBase58}`;
        return publicKeyMultibase;
    }
    async createUserDID(userDetail) {
        const { emailDIDFields } = userDetail;
        if (!emailDIDFields?.email)
            throw new Error("User ID is required to create user DID");
        emailDIDFields.email = sha256Hash(emailDIDFields?.email); // Still using email field name but storing userId
        const topicId = this.config.defaultTopicId;
        const privateKey = PrivateKey.generate();
        //  const publicKey = privateKey.publicKey;
        const did = this.generateDIDString(topicId, privateKey.publicKey);
        const document = {
            // "@context": "https://www.w3.org/ns/did/v1",
            id: did,
            verificationMethod: [{
                    id: `${did}#key-1`,
                    type: "Ed25519VerificationKey2020",
                    controller: did,
                    publicKeyMultibase: this.getED25519Raw(privateKey)
                }],
            authentication: [`${did}#key-1`],
            // assertionMethod: [`${did}#key-1`],
            customFields: {
                emailDIDFields
            }
        };
        const signedDoc = this.signDIDDocument(document, privateKey);
        await this.publishDIDOperation({
            operation: "CREATE",
            did,
            document: signedDoc,
            // signer: privateKey,
            timestamp: new Date().toISOString()
        }, this.config.defaultTopicId);
        return {
            did,
            document: signedDoc,
            // privateKey: privateKey.toString(),
            topicId: this.config.defaultTopicId
        };
    }
}
