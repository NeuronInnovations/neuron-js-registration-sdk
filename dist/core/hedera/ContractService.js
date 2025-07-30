"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = require("@hashgraph/sdk");
//import dotenv from 'dotenv';
const ethers_1 = require("ethers");
const contractABI = [
    // Minimal ABI for getDevicesFlatByOwner
    "function getDevicesFlatByOwner(address owner) view returns (uint256, string[], uint64[], uint64[], uint64[], uint256[], uint8[], uint8[])"
];
class HederaContractService {
    constructor(config) {
        const { network, operatorId, operatorKey, contractId } = config;
        this.network = network;
        this.operatorId = operatorId;
        this.operatorKey = operatorKey;
        this.contractId = contractId;
        this.client = sdk_1.Client.forName(this.network);
        this.client.setOperator(operatorId, operatorKey);
    }
    async registerPeers(topics, ipfsHash, serviceIds, prices, devicePrivateKey, deviceAccountId, contractId = this.contractId) {
        const operatorKey = devicePrivateKey;
        const operatorId = deviceAccountId;
        if (!operatorKey) {
            throw new Error("Operator key (OPERATOR_KEY) is not set in the environment variables.");
        }
        this.client.setOperator(operatorId, sdk_1.PrivateKey.fromString(operatorKey));
        try {
            const tx = await new sdk_1.ContractExecuteTransaction()
                .setContractId(contractId)
                .setGas(500000)
                .setFunction("putPeerAvailableSelf", new sdk_1.ContractFunctionParameters()
                .addUint64(parseInt(topics.stdOut.split('.')[2]))
                .addUint64(parseInt(topics.stdIn.split('.')[2]))
                .addUint64(parseInt(topics.stdErr.split('.')[2]))
                .addString(ipfsHash)
                .addUint8Array(serviceIds)
                .addUint8Array(prices))
                .execute(this.client);
            const receipt = await tx.getReceipt(this.client);
            return receipt;
        }
        catch (error) {
            console.error("Contract registration failed:", error);
            throw error;
        }
    }
    async getPeerArraySize(contractAddress) {
        try {
            const provider = new ethers_1.ethers.JsonRpcProvider(process.env.HEDERA_RPC);
            // Convert Hedera ID to EVM address if needed
            let evmAddress = contractAddress;
            if (contractAddress.startsWith('0.0.')) {
                evmAddress = hederaIdToEvmAddress(contractAddress);
                console.log(`Converted Hedera ID ${contractAddress} to EVM address ${evmAddress}`);
            }
            const contract = new ethers_1.ethers.Contract(evmAddress, [
                "function getPeerArraySize() view returns (uint256)"
            ], provider);
            const size = await contract.getPeerArraySize();
            return Number(size);
        }
        catch (error) {
            console.error("Failed to get peer array size via ethers:", error);
            throw error;
        }
    }
    /*
   async putPeerForOwner(
     ownerAddress: string,
     topics: { stdOut: string; stdIn: string; stdErr: string },
     ipfsHash: string,
     serviceIds: number[],
     prices: number[],
     devicePrivateKey: string,
     deviceAccountId: string,
     contractId: string
   ): Promise<any> {
     try {
       this.client.setOperator(
         this.operatorId,
         PrivateKey.fromString(this.operatorKey)
       );
       const tx = await new ContractExecuteTransaction()
         .setContractId(contractId)
         .setGas(500000)
         .setFunction("putPeerForOwner", new ContractFunctionParameters()
           .addAddress(ownerAddress)
           .addUint64(parseInt(topics.stdOut.split('.')[2]))
           .addUint64(parseInt(topics.stdIn.split('.')[2]))
           .addUint64(parseInt(topics.stdErr.split('.')[2]))
           .addString(ipfsHash)
           .addUint8Array(serviceIds)
           .addUint8Array(prices)
         )
         .execute(this.client);
  
       return await tx.getReceipt(this.client);
     } catch (error) {
       console.error("Failed to put peer for owner:", error);
       throw error;
     }
   }
  */
    async getDevicesByOwner(contractAddress, ownerAddress) {
        const provider = new ethers_1.ethers.JsonRpcProvider(process.env.HEDERA_RPC);
        const contract = new ethers_1.ethers.Contract(contractAddress, contractABI, provider);
        // Add a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        const [deviceCount, peerIDs, stdOutTopics, stdInTopics, stdErrTopics, serviceCounts, flatServiceIDs, flatPrices,] = await contract.getDevicesFlatByOwner(ownerAddress);
        //console.log(flatPrices);
        const devices = [];
        let serviceIndex = 0;
        for (let i = 0; i < deviceCount; i++) {
            const serviceCount = Number(serviceCounts[i]);
            const services = [];
            for (let j = 0; j < serviceCount; j++) {
                services.push({
                    serviceID: flatServiceIDs[serviceIndex],
                    price: flatPrices[serviceIndex],
                });
                serviceIndex++;
            }
            devices.push({
                peerID: peerIDs[i],
                stdOutTopic: "0.0." + stdOutTopics[i],
                stdInTopic: "0.0." + stdInTopics[i],
                stdErrTopic: "0.0." + stdErrTopics[i],
                services,
            });
        }
        return devices;
    }
    async getDevicesFlatByOwner(owner, contractId) {
        try {
            this.client.setOperator(this.operatorId, sdk_1.PrivateKey.fromString(this.operatorKey));
            const query = new sdk_1.ContractCallQuery()
                .setContractId(contractId)
                .setGas(500000)
                .setQueryPayment(new sdk_1.Hbar(0.2))
                .setFunction("getDevicesFlatByOwner", new sdk_1.ContractFunctionParameters()
                .addAddress(owner));
            const result = await query.execute(this.client);
            let index = 0;
            const deviceCount = result.getUint256(index++).toNumber();
            const peerIDs = result.getString(index++).split(',');
            const stdOutTopics = Array.from({ length: deviceCount }, () => result.getUint64(index++).toNumber());
            const stdInTopics = Array.from({ length: deviceCount }, () => result.getUint64(index++).toNumber());
            const stdErrTopics = Array.from({ length: deviceCount }, () => result.getUint64(index++).toNumber());
            const serviceCounts = Array.from({ length: deviceCount }, () => result.getUint256(index++).toNumber());
            const flatServiceIDs = new Uint8Array(); //,result.getUint8Array(index++);
            const flatPrices = new Uint8Array(); //result.getUint8Array(index++);
            return {
                deviceCount: deviceCount,
                peerIDs: peerIDs,
                stdOutTopics: stdOutTopics,
                stdInTopics: stdInTopics,
                stdErrTopics: stdErrTopics,
                serviceCounts: serviceCounts,
                flatServiceIDs: flatServiceIDs,
                flatPrices: flatPrices
            };
        }
        catch (error) {
            console.error("Failed to get flat devices by owner:", error);
            throw error;
        }
    }
    async getDeviceCountByOwner(owner, contractId) {
        try {
            this.client.setOperator(this.operatorId, sdk_1.PrivateKey.fromString(this.operatorKey));
            const query = new sdk_1.ContractCallQuery()
                .setContractId(contractId)
                .setGas(300000)
                .setQueryPayment(new sdk_1.Hbar(0.1))
                .setFunction("getDeviceCountByOwner", new sdk_1.ContractFunctionParameters()
                .addAddress(owner));
            const result = await query.execute(this.client);
            return result.getUint256(0).toNumber();
        }
        catch (error) {
            console.error("Failed to get device count by owner:", error);
            throw error;
        }
    }
    async getAllDevices(contractAddress, start = 0) {
        let peerCount = 0;
        // Use the robust method to get peer count
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                peerCount = await this.getPeerArraySize(contractAddress);
                break;
            }
            catch (e) {
                if (attempt === 3) {
                    console.error(`Failed to get peer array size after 3 attempts:`, e);
                    return [];
                }
                await new Promise(res => setTimeout(res, 2000));
            }
        }
        if (peerCount === 0) {
            console.log("No peers found in contract");
            return [];
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(process.env.HEDERA_RPC);
        // Convert Hedera ID to EVM address if needed
        let evmAddress = contractAddress;
        if (contractAddress.startsWith('0.0.')) {
            evmAddress = hederaIdToEvmAddress(contractAddress);
            console.log(`Using EVM address ${evmAddress} for ethers.js calls`);
        }
        const contract = new ethers_1.ethers.Contract(evmAddress, [
            "function peerList(uint256) view returns (address)",
            "function getDevicesFlatByOwner(address owner) view returns (uint256, string[], uint64[], uint64[], uint64[], uint256[], uint8[], uint8[])"
        ], provider);
        const allDevices = [];
        console.log(`Fetching devices for ${peerCount} peers...`);
        for (let i = start; i < peerCount; i++) {
            try {
                const owner = await contract.peerList(i);
                // Add a delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
                const [deviceCount, peerIDs, stdOutTopics, stdInTopics, stdErrTopics, serviceCounts, flatServiceIDs, flatPrices,] = await contract.getDevicesFlatByOwner(owner);
                let serviceIndex = 0;
                for (let j = 0; j < deviceCount; j++) {
                    const serviceCount = Number(serviceCounts[j]);
                    const services = [];
                    for (let k = 0; k < serviceCount; k++) {
                        services.push({
                            serviceID: flatServiceIDs[serviceIndex],
                            price: flatPrices[serviceIndex],
                        });
                        serviceIndex++;
                    }
                    allDevices.push({
                        contract: owner, // Include owner address
                        peerID: peerIDs[j],
                        stdOutTopic: "0.0." + stdOutTopics[j],
                        stdInTopic: "0.0." + stdInTopics[j],
                        stdErrTopic: "0.0." + stdErrTopics[j],
                        services,
                    });
                }
                console.log(`Processed peer ${i + 1}/${peerCount}: ${owner} (${deviceCount} devices)`);
            }
            catch (error) {
                console.error(`Error processing peer ${i}:`, error);
                // Continue with next peer instead of failing completely
                continue;
            }
        }
        console.log(`Successfully fetched ${allDevices.length} total devices`);
        return allDevices;
    }
}
function hederaIdToEvmAddress(hederaId) {
    // Remove the "0.0." prefix and convert to number
    const contractNum = parseInt(hederaId.split('.')[2]);
    // Convert to hex and pad to 40 characters (20 bytes)
    const hexAddress = '0x' + contractNum.toString(16).padStart(40, '0');
    return hexAddress;
}
exports.default = HederaContractService;
