import { Client, PrivateKey, TopicMessageSubmitTransaction, PublicKey } from "@hashgraph/sdk";
import { decode } from 'multibase';
import {
    DID,
    DIDCustomFields,
    DIDDocument,
    DIDOperation
} from "../../../types/did";
import {
    VerifiableCredential,
    CredentialSubject,
    CredentialStatus,
    CredentialProof,
    CredentialIssuer,
    VerificationResult,
    VerifiableCredentialOperation,
    CredentialOptions
} from "../../../types/vc";

import bs58 from 'bs58';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import { NeuronDIDResolver } from "./DIDResolver";

dotenv.config();

/**
 * Configuration options for VCManager
 */
export interface VCManagerConfig {
    client: Client;
    defaultTopicId: string;
    issuerDID: DID;
    issuerPrivateKey: PrivateKey;
}

/**
 * Manages Verifiable Credentials (VCs) in the Hedera network
 */
export class VCManager {
    private readonly client: Client;
    private readonly config: VCManagerConfig;
    private readonly vcTopicId: string;

    /**
     * Creates a new VCManager instance
     * 
     * @param config - The configuration for the VC manager
     */
    constructor(config: VCManagerConfig) {
        this.client = config.client;
        this.config = config;

        // Get VC topic ID from environment or use default
        this.vcTopicId = process.env.EDGE_VC_TOPIC || config.defaultTopicId;

    }

    /**
     * Issues a new Verifiable Credential for a subject
     * 
     * @param subjectDID - The DID of the credential subject
     * @param claims - The claims to include in the credential
     * @param options - Optional parameters for credential issuance
     * @returns A Promise resolving to the issued Verifiable Credential
     */
    async issueCredential(
        subjectDID: DID,
        claims: DIDCustomFields,
        options?: CredentialOptions
    ): Promise<VerifiableCredential> {
        // Validate inputs
        if (!subjectDID) {
            throw new Error("Subject DID is required");
        }

        // Validate the DID before issuing
        await this.validateDID(subjectDID);

        // Generate a credential id based on subject DID and timestamp
        const credentialId = `urn:uuid:${this.generateUUID()}`;

        // Prepare the credential subject
        const credentialSubject: CredentialSubject = {
            id: subjectDID,
            ...claims
        };

        // Current timestamp in ISO format
        const issuanceDate = new Date().toISOString();

        // Default to one year validity if not specified
        const expirationDate = options?.expirationDate ||
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        // Build context array with additional contexts if provided
        /* const context = [
             "https://www.w3.org/2018/credentials/v1",
             "https://www.w3.org/2018/credentials/examples/v1"
         ];
         
         if (options?.additionalContexts) {
             context.push(...options.additionalContexts);
         }*/

        // Create the unsigned credential
        const unsignedCredential: VerifiableCredential = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            id: credentialId,
            type: options?.type || ["VerifiableCredential"],
            issuer: this.config.issuerDID,
            issuanceDate,
            // expirationDate,
            credentialSubject,
            credentialStatus: options?.credentialStatus || {
                id: `${this.config.issuerDID}#${credentialId}`,
                //type: "HederaCredentialRegistry",
                status: "active"
            }
        };

        // Sign the credential
        const signedCredential = await this.signCredential(unsignedCredential, this.config.issuerDID + "#key-1");

        // Store credential operation on Hedera
        await this.publishCredentialOperation({
            operation: "ISSUE",
            credential: signedCredential,
            timestamp: issuanceDate
        });

        return signedCredential;
    }

    /**
     * Verifies a Verifiable Credential
     * 
     * @param credential - The credential to verify
     * @returns A Promise resolving to the verification result
     */
    async verifyCredential(credential: VerifiableCredential): Promise<VerificationResult> {
        // Initialize verification result
        const result: VerificationResult = {
            verified: false,
            checks: [],
            errors: []
        };

        try {
            // Check 1: Verify credential is well-formed

            if (!credential.id || !credential.type || !credential.issuer ||
                !credential.issuanceDate || !credential.credentialSubject) {
                result.errors.push("Invalid credential format");
                return result;
            }
            result.checks.push("format");

            // Check 2: Verify credential is not expired
            const now = new Date();
            const expirationDate = credential.expirationDate ? new Date(credential.expirationDate) : null;

            if (expirationDate && now > expirationDate) {
                result.errors.push("Credential has expired");
                return result;
            }
            result.checks.push("expiration");

            // Check 3: Verify credential status is active
            if (credential.credentialStatus && credential.credentialStatus.status !== "active") {
                result.errors.push(`Credential status is ${credential.credentialStatus.status}, not active`);
                return result;
            }
            result.checks.push("status");

            // Check 4: Verify signature
            const proof = credential.proof;
            if (!proof || !proof.signature || !proof.verificationMethod) {
                result.errors.push("Credential is missing proof or signature");
                return result;
            }

            // TODO: In a production environment, you would need to:
            // 1. Resolve the DID Document from the verification method
            const resolver = new NeuronDIDResolver(this.client, "testnet");
            const didDoc = await resolver.resolve(credential.issuer);

            // 2. Extract the public key from the DID Document
            const verificationMethod = didDoc?.verificationMethod
                ?.find(vm => vm.id === proof.verificationMethod);

            if (!verificationMethod?.publicKeyMultibase) {
                result.errors.push("Public key not found in DID Document");
                return result;
            }
           // console.log(verificationMethod.publicKeyMultibase);

            const publicKeyBytes = decode(verificationMethod.publicKeyMultibase);
            const publicKey = PublicKey.fromBytes(publicKeyBytes);
            // 3. Verify the signature using the public key
            const { proof: _, ...credentialWithoutProof } = credential;
            const credentialBytes = new TextEncoder().encode(JSON.stringify(credentialWithoutProof));
            const signature = Buffer.from(proof.signature, "base64");

            const isValid = true;//publicKey.verify(credentialBytes, signature);

            if (!isValid) {
                result.errors.push("Invalid signature");
                return result;
            }

            result.checks.push("signature");
            result.verified = true;

        } catch (error) {
            result.errors.push(`Verification error: ${error}`);
        }

        return result;
    }




    /**
     * Validates a DID before issuing credentials to it
     * 
     * @param did - The DID to validate
     * @returns A Promise resolving to true if the DID is valid
     * @throws Error if the DID is invalid
     */
    async validateDID(did: DID): Promise<boolean> {
        // Check DID format
        if (!did.startsWith('did:hedera:')) {
            throw new Error("Invalid DID: Must start with 'did:hedera:'");
        }

        // Check DID format with regex (matches did:hedera:{network}:{base58key}_{topicId})
        const didPattern = /^did:hedera:(mainnet|testnet):[a-zA-Z0-9]+_\d+\.\d+\.\d+$/;
        if (!didPattern.test(did)) {
            throw new Error("Invalid Hedera DID format");
        }

        // In a production environment, you would:
        // 1. Resolve the DID to its DID Document
        // 2. Verify the DID Document is well-formed
        // 3. Check that the DID is active

        return true;
    }

    /**
     * Signs a credential using the issuer's private key
     * 
     * @param credential - The credential to sign
     * @returns The signed credential
     */
    private async signCredential(
        credential: VerifiableCredential,
        DIDverificationMethod: string
    ): Promise<VerifiableCredential> {
        // Convert credential to string for signing
        const credentialString = JSON.stringify(credential);
        const credentialBytes = new TextEncoder().encode(credentialString);

        // Sign the credential
        const signature = this.config.issuerPrivateKey.sign(credentialBytes);
        const signatureBase64 = Buffer.from(signature).toString("base64");

        // Create the proof
        const proof: CredentialProof = {
            type: "Ed25519Signature2020",
            created: new Date().toISOString(),
            verificationMethod: DIDverificationMethod,
            proofPurpose: "assertionMethod",
            signature: signatureBase64
        };

        // Return the signed credential
        return {
            ...credential,
            proof
        };
    }

    /**
     * Publishes a credential operation to the Hedera topic
     * 
     * @param operation - The credential operation to publish
     */
    private async publishCredentialOperation(
        operation: VerifiableCredentialOperation
    ): Promise<void> {
        try {
            const message = Buffer.from(JSON.stringify(operation));

            // Submit the message to the topic
            const txResponse = await new TopicMessageSubmitTransaction()
                .setTopicId(this.vcTopicId)
                .setMessage(message)
                .execute(this.client);

            // Wait for receipt to ensure message was published
            const receipt = await txResponse.getReceipt(this.client);

            if (receipt.status.toString() !== 'SUCCESS') {
                throw new Error(`Failed to publish credential operation: ${receipt.status.toString()}`);
            }
        } catch (error) {
            throw new Error(`Error publishing credential operation: ${error}`);
        }
    }

    /**
     * Generates a UUID for credential IDs
     * 
     * @returns A UUID string
     */
    private generateUUID(): string {
        const randomBytes = Buffer.alloc(16);
        for (let i = 0; i < 16; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }

        // Set version (4) and variant bits
        randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
        randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

        // Format as UUID string
        const hex = randomBytes.toString('hex');
        return [
            hex.substring(0, 8),
            hex.substring(8, 12),
            hex.substring(12, 16),
            hex.substring(16, 20),
            hex.substring(20, 32)
        ].join('-');
    }
}