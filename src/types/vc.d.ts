// Assuming these are the contents of '../../types/did.ts'
// (Please ensure your actual file has the corrected @context type)

export type DID = string; // Simplified for this context, but it's typically a string representation of a DID

/**
 * Represents a Verifiable Credential Issuer
 */
export interface CredentialIssuer {
    id: DID;
    name?: string;
    image?: string;
}

/**
 * Represents the subject of a Verifiable Credential
 */
export interface CredentialSubject {
    id: DID;
    [key: string]: any; // Allows for additional properties like emailAddress, isVerified
}

/**
 * Represents the status of a Verifiable Credential
 */
export interface CredentialStatus {
    id: string;
    type?: string;
    status?: "active" | "suspended" | "revoked";
    statusReason?: string;
    statusDate?: string;
}

/**
 * Represents the cryptographic proof of a Verifiable Credential
 */
export interface CredentialProof {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    signature: string; // Key change: this is 'signature', not 'jws'
    challenge?: string;
    domain?: string;
}

/**
 * Represents a Verifiable Credential
 */
export interface VerifiableCredential {

    "@context"?: (string | object)[]; 
    id: string;
    type: string[];
    issuer: string; // The W3C spec uses a string (DID URL) for issuer
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: CredentialSubject;
    credentialStatus?: CredentialStatus;
    proof?: CredentialProof;
}

/**
 * Represents the result of verifying a Verifiable Credential
 */
export interface VerificationResult {
    verified: boolean;
    checks: string[];
    errors: string[];
}

/**
 * Types of operations that can be performed on a Verifiable Credential
 */
export type CredentialOperationType = "ISSUE" | "REVOKE" | "SUSPEND" | "UPDATE";

/**
 * Represents an operation on a Verifiable Credential that is recorded on Hedera
 */
export interface VerifiableCredentialOperation {
    operation: CredentialOperationType;
    credential?: VerifiableCredential;
    credentialId?: string;
    reason?: string;
    expirationDate?: string;
    timestamp: string;
}

/**
 * Options for creating a Verifiable Credential
 */
export interface CredentialOptions {
    type?: string[];
    expirationDate?: string;
    credentialStatus?: CredentialStatus;
    additionalContexts?: string[];
}

/**
 * Represents a Verifiable Presentation containing multiple credentials
 */
export interface VerifiablePresentation {
    "@context"?: string[];
    id: string;
    type: string[];
    holder: DID;
    verifiableCredential: VerifiableCredential[];
    proof?: CredentialProof;
}