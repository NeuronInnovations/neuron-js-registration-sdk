import {
  Client,
  TopicCreateTransaction,
  TopicId,
  ReceiptStatusError
} from "@hashgraph/sdk";
import { DIDManager } from "./DIDManager";
import { ServiceEndpoint } from "../../../types/did";

export class DIDInitializer {
  private readonly client: Client;
  private readonly accountID = process.env.HEDERA_OPERATOR_ID!;

  constructor(client: Client) {
    this.client = client;
  }

  async initialize(): Promise<{
    neuronDid: {
      did: string;
    //  privateKey: string;
      topicId: string;
    };
    topics: {
      didIssuerTopic: TopicId;
      didDevicesTopic: TopicId;
      vcTopic: TopicId;
    };
  }> {
    try {
      // Step 1: Initialise Topics
      const didIssuerTopic = await this.createTopic("Neuron Issuer DID Topic");
      const didDevicesTopic = await this.createTopic("Device DIDs Topic");
      const vcTopic = await this.createTopic("VC Status Topic");

      console.log("✅ Topics Created:");
      console.log(`- Neuron Issuer DID Topic: ${didIssuerTopic}`);
      console.log(`- Device DIDs Topic: ${didDevicesTopic}`);
      console.log(`- VC Topic: ${vcTopic}`);

      // Step 2: Create Neuron Issuer DID
      const didManager = new DIDManager(this.client, {
        defaultTopicId: didIssuerTopic.toString()
      });

      const neuronEmail = "contact@neuron.com";
      const neuronServices: ServiceEndpoint[] = [
        {
          id: "neuron-service-1",
          type: "MetadataService",
          serviceEndpoint: "https://neuron.com",
          description: "Neuron Root Identity Metadata"
        }
      ];

      const neuronDIDRecord = await didManager.createUserDID({
        emailDIDFields: {
          email: neuronEmail,
         // verificationStatus: "verified"
        }
      });

      console.log("\n✅ Neuron Issuer DID Created:");
      console.log(`- DID: ${neuronDIDRecord.did}`);
     // console.log(`- Private Key: ${neuronDIDRecord.privateKey.substring(0, 12)}...`);
      console.log(`- Topic ID: ${neuronDIDRecord.topicId}`);
      console.log("- DID Document:");
      console.dir(neuronDIDRecord.document, { depth: null });

      // Step 3: Return values
      return {
        neuronDid: {
          did: neuronDIDRecord.did,
        //  privateKey: neuronDIDRecord.privateKey,
          topicId: neuronDIDRecord.topicId
        },
        topics: {
          didIssuerTopic,
          didDevicesTopic,
          vcTopic
        }
      };
    } catch (error) {
      if (error instanceof ReceiptStatusError) {
        console.error("❌ Hedera Network Error:", error.status.toString());
      } else {
        console.error("❌ Initialization Failed:", error);
      }
      throw error;
    }
  }

  private async createTopic(description: string): Promise<TopicId> {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(description)
      .execute(this.client);

    const receipt = await tx.getReceipt(this.client);
    if (!receipt.topicId) {
      throw new Error(`Failed to create topic: ${description}`);
    }
    return receipt.topicId;
  }
}
