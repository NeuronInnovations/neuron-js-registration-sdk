// src/types/did.ts

export type DID = string;

// Define the structure for verification methods (for DID authentication)
export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyBase58?: string;
}

// Define the structure for service endpoints
export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
  description?: string;
}

// Define the structure for a DID Document
export interface DIDDocument {
  "@context"?: string;
  id: DID;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  service?: ServiceEndpoint[];
  controller?: DID;
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    signature: string;
  };
  // Custom fields for entities (these are optional and can be added as needed)
  customFields?: {
    [key: string]: any;
  };
}

// Record of a DID, including the DID document and private key
export interface DIDRecord {
  did: DID;
  document: DIDDocument;
 // privateKey?: string;
  topicId: string;
}

// DID Operation type to specify operations like CREATE, UPDATE, or DEACTIVATE
export interface DIDOperation {
  operation: "CREATE" | "UPDATE" | "DEACTIVATE";
  did: DID;
  document?: DIDDocument;
 // signer?: PrivateKey;  
  timestamp?: string;   
}

// DIDManager Configuration for the default topic ID
export interface DIDManagerConfig {
  defaultTopicId: string;  // The default topic ID where DID operations are posted
}

// Custom fields specific to different DID types (email, device, AI agent, etc.)
export interface DIDCustomFields {
  // For an email-based DID
  emailDIDFields?: {
    email: string;
   // verificationStatus?: "verified" | "unverified"; 
  };

  // For a device-based DID
  deviceDIDFields?: {
    smartContract?: string;
    manufacturer?: string;
    model?: string;
    serialNumber: string;
    firmwareVersion?: string;
    lastMaintenanceDate?: string;
    deviceLocation?: string;
    owner?: DID;
    location?:string;
    status?: string; // Example: "active", "inactive"
    services?:ServiceEndpoint[];
  };

  // For an AI agent DID
  aiAgentDIDFields?: {
    agentType: string;
    capabilities?: string[];
    createdAt?: string;
    status?: string; // Example: "active", "inactive"
    services?: ServiceEndpoint[];
    provider?:string;
    apiAccess?:string[];
  };
}

 