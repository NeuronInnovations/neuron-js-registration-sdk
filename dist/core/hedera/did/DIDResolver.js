export class NeuronDIDResolver {
    constructor(client, network = "testnet") {
        this.cache = new Map();
        this.client = client;
        this.mirrorNodeUrl = network === "testnet"
            ? "https://testnet.mirrornode.hedera.com"
            : "https://mainnet.mirrornode.hedera.com";
    }
    /**
     * Resolves a Hedera DID to its DID Document.
     * Caches results for performance.
     */
    async resolve(did) {
        // Check cache first
        if (this.cache.has(did)) {
            return this.cache.get(did);
        }
        // Extract topic ID from DID (did:hedera:testnet:..._0.0.1234)
        const topicId = did.split('_').pop();
        if (!topicId || !/^\d+\.\d+\.\d+$/.test(topicId)) {
            throw new Error(`Invalid DID format: ${did}`);
        }
        // Fetch messages from the Hedera topic
        const messages = await this.fetchTopicMessages(topicId);
        const document = this.findDIDDocument(messages, did);
        // Cache the result
        if (document) {
            this.cache.set(did, document);
        }
        return document;
    }
    /**
     * Fetches all messages from a Hedera HCS topic.
     */
    async fetchTopicMessages(topicId) {
        const response = await fetch(`${this.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=100`);
        const data = await response.json();
        return data.messages || [];
    }
    /**
     * Finds the latest valid DID Document in topic messages.
     */
    findDIDDocument(messages, did) {
        // Process messages in reverse chronological order
        for (let i = messages.length - 1; i >= 0; i--) {
            try {
                const m = messages[i].message;
                const decodedMessage = Buffer.from(m, 'base64').toString('utf-8');
                const operation = JSON.parse(decodedMessage);
                // console.log("WE HAVE A MESSAGE........============== "+messages[messages.length - 1].message);
                if (operation.did === did && operation.document) {
                    return operation.document;
                }
            }
            catch (e) {
                continue; // Skip invalid messages
            }
        }
        return null;
    }
    /**
     * Clears the resolver's cache.
     */
    clearCache() {
        this.cache.clear();
    }
}
